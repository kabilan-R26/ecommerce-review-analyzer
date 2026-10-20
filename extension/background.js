
const API_URL = "http://127.0.0.1:5000/predict";
const PREFIX = "eraAuto_";
const BATCH_SIZE = 100;
const MAX_REVIEWS = 5000;

// DEBUG MODE: Keep the Amazon collector tab open after analysis.
const DEBUG_KEEP_COLLECTOR_OPEN = true;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return;

  if (message.type === "ERA_START_PRODUCT") {
    startProductAnalysis(message, sender)
      .then(result => sendResponse({ ok: true, ...result }))
      .catch(error => {
        console.error("[ERA] Start failed:", error);
        sendResponse({ ok: false, error: error.message });
      });
    return true;
  }

  if (message.type === "ERA_REVIEWS_READY") {
    analyzeReviews(message, sender)
      .then(result => sendResponse({ ok: true, ...result }))
      .catch(error => {
        console.error("[ERA] Analysis failed:", error);
        sendResponse({ ok: false, error: error.message });
      });
    return true;
  }

  if (message.type === "ERA_PROGRESS") {
    relayProgress(message, sender).catch(error =>
      console.error("[ERA] Progress relay failed:", error)
    );
  }

  if (message.type === "ERA_COLLECTION_ERROR") {
    relayError(message, sender).catch(error =>
      console.error("[ERA] Collection error relay failed:", error)
    );
  }
});

function getASIN(value) {
  const asin = String(value || "").toUpperCase();

  if (!/^[A-Z0-9]{10}$/.test(asin)) {
    throw new Error("Invalid Amazon ASIN.");
  }

  return asin;
}

function sessionKey(asin) {
  return PREFIX + asin;
}

async function getSession(asin) {
  const result = await chrome.storage.session.get(sessionKey(asin));
  return result[sessionKey(asin)] || null;
}

async function saveSession(session) {
  await chrome.storage.session.set({
    [sessionKey(session.asin)]: session
  });
}

async function sendToTab(tabId, message) {
  if (typeof tabId !== "number") return false;

  try {
    await chrome.tabs.sendMessage(tabId, message);
    return true;
  } catch (error) {
    console.warn("[ERA] Tab message failed:", {
      tabId,
      type: message.type,
      error: error.message
    });
    return false;
  }
}

async function sendProgress(session, status, count = 0) {
  await sendToTab(session.sourceTabId, {
    type: "ERA_PROGRESS_UPDATE",
    asin: session.asin,
    status,
    count
  });
}

async function closeCollector(session) {
  if (typeof session?.collectorTabId !== "number") return;

  try {
    await chrome.tabs.remove(session.collectorTabId);
  } catch (_) {}
}

async function debugCollectorTab(session) {
  if (typeof session?.collectorTabId !== "number") return;

  try {
    const tab = await chrome.tabs.get(session.collectorTabId);

    console.log("[ERA] DEBUG COLLECTOR TAB:", {
      id: tab.id,
      url: tab.url,
      status: tab.status,
      title: tab.title
    });
  } catch (error) {
    console.warn("[ERA] Could not inspect collector tab:", error.message);
  }
}

/* START A FRESH ANALYSIS */
async function startProductAnalysis(message, sender) {
  const asin = getASIN(message.asin);
  const sourceTabId = sender.tab?.id;

  if (typeof sourceTabId !== "number") {
    throw new Error("Could not identify the product tab.");
  }

  const previous = await getSession(asin);

  if (previous && previous.status === "collecting") {
    await closeCollector(previous);
  }

  const session = {
    asin,
    sourceTabId,
    product: String(message.product || "Amazon Product"),
    status: "collecting",
    collectorTabId: null,
    reviews: [],
    predictions: [],
    startedAt: Date.now()
  };

  await saveSession(session);

  const reviewURL =
    "https://www.amazon.in/product-reviews/" +
    encodeURIComponent(asin) +
    "/?reviewerType=all_reviews&sortBy=recent#eraCollector=1";

  try {
    const tab = await chrome.tabs.create({
      url: reviewURL,
      active: false
    });

    session.collectorTabId = tab.id;
    await saveSession(session);

    console.log("[ERA] New collection session:", {
      asin,
      sourceTabId,
      collectorTabId: tab.id,
      reviewURL
    });

    await sendProgress(
      session,
      "Opened a fresh review page. Collecting reviews…",
      0
    );

    return {
      status: "collecting",
      collectorTabId: tab.id
    };
  } catch (error) {
    await failSession(
      session,
      "Could not open reviews: " + error.message
    );
    throw error;
  }
}

/* FORWARD COLLECTOR PROGRESS */
async function relayProgress(message, sender) {
  let asin;

  try {
    asin = getASIN(message.asin);
  } catch (_) {
    return;
  }

  const session = await getSession(asin);

  if (!session || session.status !== "collecting") return;

  if (sender.tab?.id !== session.collectorTabId) {
    console.warn("[ERA] Ignoring progress from unexpected tab:", {
      asin,
      senderTabId: sender.tab?.id,
      expectedTabId: session.collectorTabId
    });
    return;
  }

  const count = Number(message.count) || 0;

  console.log("[ERA] Collector progress:", {
    asin,
    status: message.status,
    count,
    collectorTabId: sender.tab?.id
  });

  await sendProgress(
    session,
    message.status || "Collecting reviews…",
    count
  );
}

/* HANDLE COLLECTION ERRORS */
async function relayError(message, sender) {
  let asin;

  try {
    asin = getASIN(message.asin);
  } catch (_) {
    return;
  }

  const session = await getSession(asin);

  if (!session) return;

  if (sender.tab?.id !== session.collectorTabId) {
    console.warn("[ERA] Ignoring error from unexpected tab.");
    return;
  }

  await failSession(
    session,
    message.error || "Review collection failed."
  );
}

/* SEND COLLECTED REVIEWS TO THE ML API */
async function analyzeReviews(message, sender) {
  const asin = getASIN(message.asin);
  let session = await getSession(asin);

  if (!session) {
    throw new Error(
      "Analysis session not found. Refresh the product page."
    );
  }

  if (sender.tab?.id !== session.collectorTabId) {
    throw new Error("Unexpected review collector tab.");
  }

  if (session.status !== "collecting") {
    return {
      status: session.status,
      count: session.predictions?.length || 0
    };
  }

  const input = Array.isArray(message.reviews)
    ? message.reviews
    : [];

  // Preserve the first review for each ID.
  const unique = new Map();

  for (const review of input) {
    if (!review || typeof review.text !== "string") continue;

    const text = review.text.trim();
    if (!text) continue;

    const id = String(review.id || text.toLowerCase());

    if (!unique.has(id)) {
      unique.set(id, {
        ...review,
        id,
        text
      });
    }
  }

  const reviews = [...unique.values()].slice(0, MAX_REVIEWS);

  console.log("[ERA] COLLECTION SUMMARY:", {
    asin,
    receivedFromCollector: input.length,
    uniqueReviews: reviews.length,
    maxReviews: MAX_REVIEWS,
    batchSize: BATCH_SIZE,
    collectorTabId: session.collectorTabId
  });

  await debugCollectorTab(session);

  if (!reviews.length) {
    await failSession(session, "No readable review text was collected.");
    return { status: "failed", count: 0 };
  }

  // Mark the session as analyzing to prevent duplicate submissions.
  session.status = "analyzing";
  session.reviews = reviews;
  await saveSession(session);

  const predictions = [];

  try {
    const totalBatches = Math.ceil(reviews.length / BATCH_SIZE);

    for (let start = 0; start < reviews.length; start += BATCH_SIZE) {
      const batch = reviews.slice(start, start + BATCH_SIZE);
      const batchNumber = Math.floor(start / BATCH_SIZE) + 1;

      await sendProgress(
        session,
        "Sending batch " + batchNumber + " of " +
          totalBatches + " to the ML API…",
        predictions.length
      );

      console.log("[ERA] Sending batch:", {
        asin,
        batchNumber,
        reviewsInBatch: batch.length
      });

      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          reviews: batch.map(review => review.text)
        })
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");

        throw new Error(
          "ML API returned HTTP " + response.status +
          (errorBody ? ": " + errorBody.slice(0, 300) : "")
        );
      }

      const data = await response.json();

      if (!Array.isArray(data.predictions)) {
        throw new Error("ML API response is missing predictions.");
      }

      if (data.predictions.length !== batch.length) {
        throw new Error(
          "Batch " + batchNumber + ": sent " + batch.length +
          " reviews but received " + data.predictions.length +
          " predictions."
        );
      }

      data.predictions.forEach((prediction, index) => {
        predictions.push({
          ...batch[index],
          text:
            typeof prediction.review === "string" &&
            prediction.review.trim()
              ? prediction.review
              : batch[index].text,
          sentiment: prediction.sentiment || "Unknown",
          confidence:
            typeof prediction.confidence === "number"
              ? prediction.confidence
              : null
        });
      });

      console.log("[ERA] API BATCH RESULT:", {
        asin,
        batchNumber,
        batchInput: batch.length,
        predictionsReceived: data.predictions.length,
        totalPredictions: predictions.length
      });

      await sendProgress(
        session,
        "Analyzed " + predictions.length + " of " +
          reviews.length + " reviews…",
        predictions.length
      );
    }

    if (predictions.length !== reviews.length) {
      throw new Error(
        "Final count mismatch: " + reviews.length +
        " reviews but " + predictions.length + " predictions."
      );
    }

    session = {
      ...session,
      status: "complete",
      reviews,
      predictions,
      completedAt: Date.now()
    };

    await saveSession(session);

    console.log("[ERA] ANALYSIS COMPLETE:", {
      asin,
      reviewsCollected: reviews.length,
      predictionsCreated: predictions.length,
      collectorTabId: session.collectorTabId
    });

    await sendToTab(session.sourceTabId, {
      type: "ERA_ANALYSIS_COMPLETE",
      asin,
      product: session.product,
      reviews,
      predictions
    });

    if (DEBUG_KEEP_COLLECTOR_OPEN) {
      console.log(
        "[ERA] DEBUG: Keeping collector tab open:",
        session.collectorTabId
      );

      await debugCollectorTab(session);
    } else {
      await closeCollector(session);
    }

    return {
      status: "complete",
      count: predictions.length
    };
  } catch (error) {
    await failSession(session, error.message);
    throw error;
  }
}

/* MARK SESSION FAILED */
async function failSession(session, errorMessage) {
  const failed = {
    ...session,
    status: "failed",
    error: errorMessage,
    failedAt: Date.now()
  };

  await saveSession(failed);

  console.error("[ERA] SESSION FAILED:", errorMessage);

  await sendToTab(session.sourceTabId, {
    type: "ERA_ANALYSIS_ERROR",
    asin: session.asin,
    error: errorMessage
  });

  // Leave the collector open in debug mode for inspection.
  if (!DEBUG_KEEP_COLLECTOR_OPEN) {
    await closeCollector(session);
  } else {
    await debugCollectorTab(session);
  }
}
