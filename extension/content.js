(function () {
    if (document.getElementById("era-panel")) {
        return;
    }

    const panel = document.createElement("div");
    panel.id = "era-panel";

    panel.innerHTML = `
        <div class="era-header">
            <h2>Review Analyzer</h2>
            <div class="era-header-actions">
                <button id="era-refresh" title="Re-scan page">⟳</button>
                <button id="era-minimize" title="Minimize">—</button>
                <button id="era-close" title="Close">×</button>
            </div>
        </div>

        <div class="era-content">

            <h3>Product</h3>
            <p id="era-product">Detecting...</p>

            <h3>Rating</h3>
            <p id="era-rating">Detecting...</p>

            <div class="era-summary-grid">

                <div class="era-stat">
                    <span id="era-count">0</span>
                    <label>Reviews Found</label>
                </div>

                <div class="era-stat">
                    <span id="era-avg-sentiment">–</span>
                    <label>Avg Sentiment</label>
                </div>

                <div class="era-stat">
                    <span id="era-flagged">0</span>
                    <label>Flagged Reviews</label>
                </div>

            </div>

            <h3>Reviews</h3>

            <div id="era-filter-bar">
                <button data-filter="all" class="era-filter-btn active">
                    All
                </button>

                <button data-filter="positive" class="era-filter-btn">
                    Positive
                </button>

                <button data-filter="negative" class="era-filter-btn">
                    Negative
                </button>

                <button data-filter="flagged" class="era-filter-btn">
                    Flagged
                </button>
            </div>

            <div id="era-reviews">
                <p>Reading reviews...</p>
            </div>

            <button id="era-export">
                Export JSON
            </button>

        </div>
    `;

    document.body.appendChild(panel);


    // ============================================================
    // UI CONTROLS
    // ============================================================

    document.getElementById("era-close").addEventListener("click", () => {
        panel.style.display = "none";
    });


    let minimized = false;

    document.getElementById("era-minimize").addEventListener("click", () => {
        minimized = !minimized;
        panel.classList.toggle("era-minimized", minimized);
    });


    document.getElementById("era-refresh").addEventListener("click", () => {
        displayData();
    });


    // ============================================================
    // DRAGGABLE HEADER
    // ============================================================

    (function makeDraggable() {

        const header = panel.querySelector(".era-header");

        let offsetX = 0;
        let offsetY = 0;
        let dragging = false;

        header.addEventListener("mousedown", (e) => {

            dragging = true;

            offsetX = e.clientX - panel.offsetLeft;
            offsetY = e.clientY - panel.offsetTop;

        });


        document.addEventListener("mousemove", (e) => {

            if (!dragging) {
                return;
            }

            panel.style.left = (e.clientX - offsetX) + "px";
            panel.style.top = (e.clientY - offsetY) + "px";
            panel.style.right = "auto";

        });


        document.addEventListener("mouseup", () => {
            dragging = false;
        });

    })();


    // ============================================================
    // PRODUCT NAME EXTRACTION
    // ============================================================

    function getProductName() {

        const selectors = [
            "#productTitle",
            "h1.product-title-word-break",
            "span#productTitle"
        ];

        for (const selector of selectors) {

            const element = document.querySelector(selector);

            if (element && element.innerText.trim()) {
                return element.innerText.trim();
            }

        }

        return "Product name not detected";
    }


    // ============================================================
    // RATING EXTRACTION
    // ============================================================

    function getRating() {

        const selectors = [
            "#acrPopover span.a-icon-alt",
            "span[data-hook='rating-out-of-text']",
            "i[data-hook='average-star-rating'] span.a-icon-alt"
        ];

        for (const selector of selectors) {

            const element = document.querySelector(selector);

            if (element && element.innerText.trim()) {
                return element.innerText.trim();
            }

        }

        return "Rating not detected";
    }


    // ============================================================
    // REVIEW EXTRACTION
    // ============================================================

    function getReviews() {

        const reviews = [];

        const selectors = [

            // Main Amazon review selector
            '[data-hook="review-body"]',

            // Review body containing span
            '[data-hook="review-body"] span',

            // Alternative Amazon review structure
            '.review-text-content',

            // Alternative review text structure
            '.review-text-content span',

            // Amazon review containers
            '[id^="customer_review"] .review-text-content',

            // Review body inside customer review
            '[id^="customer_review"] [data-hook="review-body"]'

        ];


        for (const selector of selectors) {

            const elements = document.querySelectorAll(selector);

            elements.forEach((element) => {

                const text = element.innerText
                    .replace(/\s+/g, " ")
                    .trim();

                if (
                    text.length > 20 &&
                    !reviews.includes(text)
                ) {
                    reviews.push(text);
                }

            });


            if (reviews.length > 0) {
                break;
            }

        }


        return [...new Set(reviews)];
    }


    // ============================================================
    // SENTIMENT WORD LIST
    // ============================================================

    const POSITIVE_WORDS = [
        "great",
        "excellent",
        "love",
        "amazing",
        "perfect",
        "good",
        "best",
        "happy",
        "recommend",
        "awesome",
        "fantastic",
        "durable",
        "quality",
        "worth",
        "satisfied",
        "comfortable",
        "useful",
        "nice",
        "helpful",
        "wonderful"
    ];


    const NEGATIVE_WORDS = [
        "bad",
        "poor",
        "terrible",
        "broke",
        "broken",
        "worst",
        "hate",
        "disappointed",
        "waste",
        "defective",
        "cheap",
        "fake",
        "refund",
        "return",
        "useless",
        "damaged",
        "awful",
        "horrible",
        "dislike",
        "problem",
        "issue"
    ];


    // ============================================================
    // LIGHTWEIGHT SENTIMENT SCORING
    // ============================================================

    function scoreSentiment(text) {

        const lower = text.toLowerCase();

        let score = 0;


        POSITIVE_WORDS.forEach((word) => {

            if (lower.includes(word)) {
                score += 1;
            }

        });


        NEGATIVE_WORDS.forEach((word) => {

            if (lower.includes(word)) {
                score -= 1;
            }

        });


        return score;
    }


    // ============================================================
    // FAKE / SUSPICIOUS REVIEW HEURISTICS
    // ============================================================

    function flagReview(text) {

        const reasons = [];

        const wordCount = text
            .split(/\s+/)
            .filter(Boolean)
            .length;


        if (wordCount < 4) {
            reasons.push("Very short review");
        }


        if (/(.)\1{4,}/.test(text)) {
            reasons.push("Repeated characters");
        }


        const exclamationCount =
            (text.match(/!/g) || []).length;


        if (exclamationCount > 4) {
            reasons.push("Excessive exclamation marks");
        }


        return reasons;
    }


    // ============================================================
    // HTML SAFETY
    // ============================================================

    function escapeHTML(text) {

        const div = document.createElement("div");

        div.textContent = text;

        return div.innerHTML;
    }


    // ============================================================
    // REVIEW DATA
    // ============================================================

    let currentReviews = [];

    let activeFilter = "all";


    // ============================================================
    // RENDER REVIEWS
    // ============================================================

    function renderReviews() {

        const container =
            document.getElementById("era-reviews");

        container.innerHTML = "";


        const filtered = currentReviews.filter((review) => {

            if (activeFilter === "all") {
                return true;
            }


            if (activeFilter === "positive") {
                return review.sentiment > 0;
            }


            if (activeFilter === "negative") {
                return review.sentiment < 0;
            }


            if (activeFilter === "flagged") {
                return review.flags.length > 0;
            }


            return true;

        });


        if (filtered.length === 0) {

            container.innerHTML =
                "<p>No reviews match this filter.</p>";

            return;
        }


        filtered.forEach((review, index) => {

            const box =
                document.createElement("div");

            box.className = "era-review";


            if (review.flags.length > 0) {
                box.classList.add("era-flagged");
            }


            const sentimentLabel =
                review.sentiment > 0
                    ? "Positive"
                    : review.sentiment < 0
                        ? "Negative"
                        : "Neutral";


            box.innerHTML = `

                <div class="era-review-meta">

                    <strong>
                        Review ${index + 1}
                    </strong>

                    <span class="era-badge era-sentiment-${sentimentLabel.toLowerCase()}">
                        ${sentimentLabel}
                    </span>

                </div>

                <p>
                    ${escapeHTML(review.text)}
                </p>

                ${
                    review.flags.length > 0
                        ? `
                            <p class="era-flags">
                                ⚠ ${review.flags.map(escapeHTML).join(", ")}
                            </p>
                          `
                        : ""
                }

            `;


            container.appendChild(box);

        });

    }


    // ============================================================
    // DISPLAY / SCAN DATA
    // ============================================================

    function displayData() {

        const product = getProductName();

        const rating = getRating();


        document.getElementById("era-product").innerText =
            product;

        document.getElementById("era-rating").innerText =
            rating;


        const container =
            document.getElementById("era-reviews");


        container.innerHTML =
            "<p>Scanning reviews...</p>";


        let attempts = 0;

        const maxAttempts = 10;


        /*
         * Amazon loads review content dynamically.
         *
         * Therefore we don't check only once.
         * We check every 2 seconds.
         */

        const reviewScanner = setInterval(() => {

            attempts++;


            const rawReviews = getReviews();


            document.getElementById("era-count").innerText =
                rawReviews.length;


            // ----------------------------------------------------
            // Reviews found
            // ----------------------------------------------------

            if (rawReviews.length > 0) {

                clearInterval(reviewScanner);


                currentReviews =
                    rawReviews.slice(0, 10).map((text) => ({

                        text: text,

                        sentiment:
                            scoreSentiment(text),

                        flags:
                            flagReview(text)

                    }));


                const flaggedCount =
                    currentReviews.filter(
                        (review) => review.flags.length > 0
                    ).length;


                document.getElementById("era-flagged").innerText =
                    flaggedCount;


                const avg =
                    currentReviews.length

                        ? (
                            currentReviews.reduce(
                                (sum, review) =>
                                    sum + review.sentiment,
                                0
                            ) / currentReviews.length
                          ).toFixed(2)

                        : "–";


                document.getElementById(
                    "era-avg-sentiment"
                ).innerText = avg;


                renderReviews();


                // Save scan information
                if (
                    typeof chrome !== "undefined" &&
                    chrome.storage &&
                    chrome.storage.local
                ) {

                    chrome.storage.local.set({

                        lastScan: {

                            url: location.href,

                            product: product,

                            rating: rating,

                            reviewCount:
                                rawReviews.length,

                            flaggedCount:
                                flaggedCount,

                            avgSentiment:
                                avg,

                            timestamp:
                                Date.now()

                        }

                    });

                }


                return;
            }


            // ----------------------------------------------------
            // No reviews found yet
            // ----------------------------------------------------

            container.innerHTML = `
                <p>
                    Scanning reviews...
                    <br>
                    Attempt ${attempts}/${maxAttempts}
                </p>
            `;


            // ----------------------------------------------------
            // Maximum attempts reached
            // ----------------------------------------------------

            if (attempts >= maxAttempts) {

                clearInterval(reviewScanner);


                container.innerHTML = `
                    <p>
                        No reviews could be detected.
                    </p>

                    <p style="font-size: 12px; opacity: 0.7;">
                        Try scrolling to the review section and
                        press the refresh button.
                    </p>
                `;

            }

        }, 2000);

    }


    // ============================================================
    // FILTER BUTTONS
    // ============================================================

    document
        .querySelectorAll(".era-filter-btn")
        .forEach((button) => {

            button.addEventListener("click", () => {

                document
                    .querySelectorAll(".era-filter-btn")
                    .forEach((btn) => {
                        btn.classList.remove("active");
                    });


                button.classList.add("active");


                activeFilter =
                    button.dataset.filter;


                renderReviews();

            });

        });


    // ============================================================
    // EXPORT JSON
    // ============================================================

    document
        .getElementById("era-export")
        .addEventListener("click", () => {

            const data = {

                product:
                    document.getElementById(
                        "era-product"
                    ).innerText,

                rating:
                    document.getElementById(
                        "era-rating"
                    ).innerText,

                reviews:
                    currentReviews,

                scannedAt:
                    new Date().toISOString()

            };


            const blob = new Blob(
                [
                    JSON.stringify(
                        data,
                        null,
                        2
                    )
                ],
                {
                    type: "application/json"
                }
            );


            const url =
                URL.createObjectURL(blob);


            const link =
                document.createElement("a");


            link.href = url;

            link.download =
                "review-analysis.json";


            link.click();


            URL.revokeObjectURL(url);

        });


    // ============================================================
    // INITIAL SCAN
    // ============================================================

    setTimeout(() => {

        displayData();

    }, 1500);

})();