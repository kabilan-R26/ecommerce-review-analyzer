
(() => {
    "use strict";
  
    // Prevent duplicate extension panels and timers.
    if (window.__ERA_TIMER__) clearInterval(window.__ERA_TIMER__);
    document.getElementById("era-panel")?.remove();
  
    window.__ERA_RUNNING__ = true;
  
    const POSITIVE_WORDS = [
      "good", "great", "excellent", "amazing", "awesome", "best",
      "love", "loved", "happy", "perfect", "nice", "fast", "quick",
      "reliable", "useful", "convenient", "recommend", "recommended",
      "value", "worth", "premium", "durable", "comfortable",
      "beautiful", "smooth", "helpful", "quality", "powerful",
      "impressive", "satisfied", "fantastic", "wonderful", "efficient"
    ];
  
    const NEGATIVE_WORDS = [
      "bad", "poor", "worst", "terrible", "awful", "hate",
      "disappointed", "slow", "heavy", "bulky", "expensive",
      "overheating", "overheat", "broken", "defective", "damaged",
      "issue", "issues", "problem", "problems", "faulty",
      "unreliable", "waste", "useless", "scratches", "scratch",
      "weak", "difficult", "failure", "failed", "stopped",
      "refund", "dislike", "inconvenient", "fragile", "delayed"
    ];
  
    const NEGATIONS = [
      "not", "no", "never", "hardly", "isn't", "wasn't",
      "doesn't", "don't", "didn't", "can't", "cannot"
    ];
  
    const ASPECTS = {
      "Performance": [
        "performance", "works well", "working", "reliable",
        "efficient", "powerful", "smooth", "output"
      ],
      "Battery life": [
        "battery life", "battery backup", "battery", "backup",
        "capacity", "mah", "long lasting", "lasts long"
      ],
      "Charging speed": [
        "charging speed", "fast charging", "charging quickly",
        "charges quickly", "charges fast", "slow charging",
        "67w", "65w", "charging time"
      ],
      "Build quality": [
        "build quality", "durable", "durability", "finish",
        "scratches", "scratch", "plastic", "premium",
        "solid", "sturdy", "casing", "material"
      ],
      "Design and portability": [
        "design", "portable", "portability", "heavy", "bulky",
        "weight", "compact", "size", "appearance"
      ],
      "Value for money": [
        "value for money", "worth the money", "worth it",
        "price", "expensive", "affordable", "budget", "cost"
      ],
      "Ease of use": [
        "easy to use", "convenient", "handy", "easy",
        "simple", "display", "cable", "built in cable",
        "built-in cable", "inbuilt wire"
      ],
      "Customer experience": [
        "customer service", "support", "delivery", "packaging",
        "experience", "purchase", "return", "refund"
      ]
    };
  
    const CATEGORY_RULES = [
      ["Power Bank", ["power bank", "powerbank", "portable charger"]],
      ["Mobile Phone", ["smartphone", "mobile phone", "iphone", "android phone"]],
      ["Laptop", ["laptop", "notebook computer", "macbook"]],
      ["Headphones", ["headphones", "earbuds", "earphones", "headset"]],
      ["Shoes", ["shoes", "sneakers", "footwear", "sandals"]],
      ["Skincare", ["moisturizer", "moisturiser", "face cream", "serum", "sunscreen"]],
      ["Smartwatch", ["smartwatch", "smart watch", "fitness watch"]],
      ["Television", ["television", "smart tv", "4k tv", "oled tv"]],
      ["Speaker", ["bluetooth speaker", "portable speaker", "soundbar"]],
      ["Home Appliance", ["vacuum cleaner", "mixer grinder", "air fryer", "washing machine", "refrigerator"]]
    ];
  
    const state = {
      reviews: [],
      filter: "all",
      product: "",
      category: "General Product"
    };
  
    const panel = document.createElement("div");
    panel.id = "era-panel";
  
    panel.innerHTML = `
      <style>
        #era-panel {
          position:fixed;top:60px;right:12px;
          width:350px;max-height:calc(100vh - 75px);
          overflow-y:auto;z-index:2147483647;
          background:#f8fafc;color:#0f172a;
          border:1px solid #cbd5e1;border-radius:16px;
          box-shadow:0 8px 32px rgba(15,23,42,.28);
          font:12px/1.5 Arial,sans-serif;
        }
        #era-panel *{box-sizing:border-box}
        #era-panel .era-header{
          position:sticky;top:0;z-index:3;
          display:flex;justify-content:space-between;align-items:center;
          gap:8px;padding:15px;background:#0f172a;color:white;
        }
        #era-panel .era-brand{font-size:15px;font-weight:700}
        #era-panel .era-header-actions{display:flex;gap:5px}
        #era-panel button{cursor:pointer;font:inherit}
        #era-panel .era-icon-btn{
          background:transparent;color:white;border:0;font-size:18px;padding:2px 5px;
        }
        #era-panel .era-body{padding:12px}
        #era-panel .era-card{
          background:white;border:1px solid #dbe4ef;
          border-radius:12px;padding:12px;margin-bottom:10px;
        }
        #era-panel .era-label{
          font-size:10px;font-weight:700;letter-spacing:1px;color:#64748b;margin-bottom:5px;
        }
        #era-panel .era-product-title{font-size:12px;font-weight:700;overflow-wrap:anywhere}
        #era-panel .era-muted{color:#64748b}
        #era-panel .era-verdict{font-size:17px;font-weight:700;margin:3px 0 6px}
        #era-panel .era-stats{
          display:grid;grid-template-columns:repeat(3,minmax(0,1fr));
          gap:6px;margin-bottom:12px;
        }
        #era-panel .era-stat{
          background:white;border:1px solid #dbe4ef;border-radius:10px;
          padding:10px 3px;text-align:center;
        }
        #era-panel .era-stat-number{display:block;font-size:20px;font-weight:700}
        #era-panel .era-stat-label{display:block;font-size:9px;color:#64748b;text-transform:uppercase}
        #era-panel .era-section-title{font-size:12px;font-weight:700;margin:14px 0 8px}
        #era-panel .era-bar-row{margin:8px 0}
        #era-panel .era-bar-label{display:flex;justify-content:space-between;margin-bottom:4px}
        #era-panel .era-track{height:6px;background:#e2e8f0;border-radius:10px;overflow:hidden}
        #era-panel .era-fill{height:100%;border-radius:10px}
        #era-panel .era-positive{background:#16a34a}
        #era-panel .era-neutral{background:#94a3b8}
        #era-panel .era-negative{background:#dc2626}
        #era-panel .era-aspect-card,#era-panel .era-review{
          background:white;border:1px solid #dbe4ef;border-radius:10px;
          padding:10px;margin-bottom:8px;
        }
        #era-panel .era-aspect-title,#era-panel .era-review-title{font-weight:700;margin-bottom:4px}
        #era-panel .era-badge{
          display:inline-block;border-radius:6px;padding:2px 6px;font-size:10px;font-weight:700;
        }
        #era-panel .era-badge-positive{color:#166534;background:#dcfce7}
        #era-panel .era-badge-neutral{color:#475569;background:#e2e8f0}
        #era-panel .era-badge-negative{color:#991b1b;background:#fee2e2}
        #era-panel .era-pro-con{padding-left:17px;margin:5px 0}
        #era-panel .era-pro-con li{margin:5px 0}
        #era-panel .era-filters{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:9px}
        #era-panel .era-filter-btn{
          border:1px solid #cbd5e1;background:white;color:#334155;
          border-radius:7px;padding:5px 8px;
        }
        #era-panel .era-filter-btn.active{background:#0f172a;color:white}
        #era-panel .era-review-text{overflow-wrap:anywhere}
        #era-panel .era-review-meta{font-size:10px;color:#64748b;margin-top:5px}
        #era-panel .era-actions{display:flex;gap:7px;margin:10px 0}
        #era-panel .era-action-btn{
          flex:1;padding:9px;border:0;border-radius:8px;font-weight:700;
        }
        #era-panel .era-primary{background:#0f172a;color:white}
        #era-panel .era-secondary{background:#e2e8f0;color:#0f172a}
        #era-panel .era-empty{padding:12px;color:#64748b;text-align:center}
        #era-panel .era-warning{
          background:#fff7ed;color:#9a3412;border:1px solid #fed7aa;
          border-radius:8px;padding:9px;margin-bottom:10px;
        }
        #era-panel.era-minimized .era-body{display:none}
        @media(max-width:600px){
          #era-panel{width:min(350px,calc(100vw - 16px));right:8px;top:55px}
        }
      </style>
  
      <div class="era-header">
        <div>
          <div class="era-brand">Review Intelligence</div>
          <div id="era-category" style="margin-top:4px;font-size:10px;color:#cbd5e1">Detecting product...</div>
        </div>
        <div class="era-header-actions">
          <button class="era-icon-btn" id="era-refresh" title="Refresh">↻</button>
          <button class="era-icon-btn" id="era-minimize" title="Minimize">−</button>
          <button class="era-icon-btn" id="era-close" title="Close">×</button>
        </div>
      </div>
  
      <div class="era-body">
        <div class="era-card">
          <div class="era-label">PRODUCT</div>
          <div class="era-product-title" id="era-product"></div>
          <div id="era-product-rating" style="margin-top:5px;color:#b45309"></div>
        </div>
  
        <div class="era-card">
          <div class="era-label">OVERALL VERDICT</div>
          <div class="era-verdict" id="era-verdict">Collecting reviews...</div>
          <div id="era-verdict-note" class="era-muted"></div>
        </div>
  
        <div class="era-stats">
          <div class="era-stat"><span class="era-stat-number" id="era-count">0</span><span class="era-stat-label">Analyzed</span></div>
          <div class="era-stat"><span class="era-stat-number" id="era-positive-count">0%</span><span class="era-stat-label">Positive</span></div>
          <div class="era-stat"><span class="era-stat-number" id="era-flags">0</span><span class="era-stat-label">Potential flags</span></div>
        </div>
  
        <div class="era-section-title">Sentiment Distribution</div>
        <div class="era-card" id="era-sentiment"></div>
  
        <div class="era-section-title">Product-Specific Analysis</div>
        <div id="era-aspects"></div>
  
        <div class="era-section-title">Pros and Cons</div>
        <div class="era-card">
          <div style="font-weight:700;color:#15803d">What customers like</div>
          <ul class="era-pro-con" id="era-pros"></ul>
          <div style="font-weight:700;color:#b91c1c;margin-top:10px">Common complaints</div>
          <ul class="era-pro-con" id="era-cons"></ul>
        </div>
  
        <div class="era-section-title">Potential Review Risks</div>
        <div class="era-card" id="era-risks"></div>
  
        <div class="era-section-title">Reviews</div>
        <div class="era-filters">
          <button class="era-filter-btn active" data-filter="all">All</button>
          <button class="era-filter-btn" data-filter="positive">Positive</button>
          <button class="era-filter-btn" data-filter="neutral">Neutral</button>
          <button class="era-filter-btn" data-filter="negative">Negative</button>
          <button class="era-filter-btn" data-filter="flagged">Flagged</button>
        </div>
        <div id="era-reviews"></div>
  
        <div class="era-actions">
          <button class="era-action-btn era-primary" id="era-export">Export JSON</button>
          <button class="era-action-btn era-secondary" id="era-scan">Scan again</button>
        </div>
        <div class="era-muted" style="font-size:10px;margin:8px 2px">
          Rule-based analysis of reviews loaded on Amazon. Potential flags are indicators only, not proof of fake reviews.
        </div>
      </div>
    `;
  
    document.body.appendChild(panel);
  
    const $ = (selector) => panel.querySelector(selector);
    const $$ = (selector) => panel.querySelectorAll(selector);
  
    function escapeHTML(value) {
      return String(value ?? "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
      })[char]);
    }
  
    function getProductTitle() {
      return (
        document.querySelector("#productTitle")?.innerText ||
        document.querySelector("h1 span")?.innerText ||
        document.title ||
        "Unknown Product"
      ).replace(/\s+/g, " ").trim();
    }
  
    function getProductRating() {
      return (
        document.querySelector('[data-hook="rating-out-of-text"]')?.innerText ||
        document.querySelector("#acrPopover")?.getAttribute("title") ||
        ""
      ).replace(/\s+/g, " ").trim();
    }
  
    function detectCategory(title) {
      const text = title.toLowerCase();
  
      for (const [category, keywords] of CATEGORY_RULES) {
        if (keywords.some((keyword) => text.includes(keyword))) return category;
      }
  
      return "General Product";
    }
  
    function makeReviewId(text, title, author) {
      const source = `${title}|${author}|${text}`.toLowerCase();
      let hash = 0;
  
      for (let i = 0; i < source.length; i++) {
        hash = ((hash << 5) - hash + source.charCodeAt(i)) | 0;
      }
  
      return String(hash);
    }
  
    // FIX: selectors match the actual Amazon HTML provided.
    function extractReview(element) {
      const card = element.matches?.('[data-hook="review"]')
        ? element
        : element.closest?.('[data-hook="review"]');
  
      if (!card) return null;
  
      const bodyElement =
        card.querySelector('[data-hook="reviewRichContentContainer"]') ||
        card.querySelector('[data-hook="reviewText"]') ||
        card.querySelector('[data-hook="reviewTextContainer"]') ||
        card.querySelector('[data-hook="review-text"]') ||
        card.querySelector('[data-hook="review-body"]');
  
      if (!bodyElement) return null;
  
      const text = (
        bodyElement.innerText ||
        bodyElement.textContent ||
        ""
      ).replace(/\s+/g, " ").trim();
  
      if (text.length < 10) return null;
  
      const titleElement =
        card.querySelector('[data-hook="reviewTitle"]') ||
        card.querySelector('[data-hook="review-title"]');
  
      const ratingElement =
        card.querySelector('[data-hook="review-star-rating"]') ||
        card.querySelector('[data-hook="cmps-review-star-rating"]') ||
        card.querySelector('[data-hook="review-rating"]');
  
      const authorElement = card.querySelector(".a-profile-name");
      const dateElement = card.querySelector('[data-hook="review-date"]');
      const verifiedElement = card.querySelector('[data-hook="avp-badge"]');
  
      const ratingText =
        ratingElement?.innerText ||
        ratingElement?.querySelector(".a-icon-alt")?.textContent ||
        ratingElement?.getAttribute("aria-label") ||
        "";
  
      const ratingMatch = ratingText.match(/([1-5](?:\.\d+)?)/);
  
      const title = (
        titleElement?.innerText ||
        titleElement?.textContent ||
        ""
      ).replace(/\s+/g, " ").trim();
  
      const author = (authorElement?.innerText || "").trim();
      const date = (dateElement?.innerText || "").replace(/\s+/g, " ").trim();
  
      return {
        id: makeReviewId(text, title, author),
        title,
        text,
        rating: ratingMatch ? Number(ratingMatch[1]) : null,
        author,
        date,
        verified: Boolean(verifiedElement),
        flagged: false,
        flagReasons: [],
        sentiment: "neutral",
        sentimentScore: 0
      };
    }
  
    function extractSidePanelReview(element) {
      const text = (element.innerText || element.textContent || "")
        .replace(/\s+/g, " ").trim();
  
      if (text.length < 10) return null;
  
      const card = element.closest(".cr-sidepanel, article") || element.parentElement;
  
      const title = (
        card?.querySelector('[data-reviewbind="Title"], h5')?.innerText || ""
      ).trim();
  
      const author = (
        card?.querySelector('.a-profile-name, [data-reviewbind="Author"]')?.innerText || ""
      ).trim();
  
      const ratingText = (
        card?.querySelector('[data-reviewbind="Rating"], [aria-label*="star"]')?.innerText || ""
      );
  
      const ratingMatch = ratingText.match(/([1-5](?:\.\d+)?)/);
  
      return {
        id: makeReviewId(text, title, author),
        title,
        text,
        rating: ratingMatch ? Number(ratingMatch[1]) : null,
        author,
        date: "",
        verified: false,
        flagged: false,
        flagReasons: [],
        sentiment: "neutral",
        sentimentScore: 0
      };
    }
  
    function collectVisibleReviews() {
      const cards = Array.from(
        document.querySelectorAll('[data-hook="review"]')
      );
  
      if (cards.length) {
        return cards.map(extractReview).filter(Boolean);
      }
  
      return Array.from(
        document.querySelectorAll('[data-reviewbind="ReviewText"]')
      ).map(extractSidePanelReview).filter(Boolean);
    }
  
    function scoreSentiment(text) {
      const words = text.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) || [];
      let score = 0;
  
      for (let i = 0; i < words.length; i++) {
        const previous = words.slice(Math.max(0, i - 3), i);
        const negated = previous.some((word) => NEGATIONS.includes(word));
  
        if (POSITIVE_WORDS.includes(words[i])) score += negated ? -1 : 1;
        if (NEGATIVE_WORDS.includes(words[i])) score += negated ? 1 : -1;
      }
  
      return score;
    }
  
    function analyzeSentiment(review) {
      const score = scoreSentiment(`${review.title} ${review.text}`);
      review.sentimentScore = score;
  
      if (review.rating !== null) {
        if (review.rating === 3) {
          review.sentiment = "neutral";
        } else if (review.rating >= 4) {
          review.sentiment = score < 0 ? "negative" : "positive";
        } else {
          review.sentiment = score > 0 ? "positive" : "negative";
        }
      } else {
        review.sentiment = score > 0 ? "positive" : score < 0 ? "negative" : "neutral";
      }
    }
  
    function detectReviewRisks(review) {
      const reasons = [];
      const text = review.text || "";
      const words = text.toLowerCase().match(/\b[a-z0-9]+\b/g) || [];
  
      if (text.length < 35) reasons.push("Very short review");
      if (/(.)\1{5,}/i.test(text)) reasons.push("Repeated characters");
      if ((text.match(/!/g) || []).length >= 5) reasons.push("Excessive exclamation marks");
  
      if (words.length >= 12) {
        const counts = {};
        words.forEach((word) => counts[word] = (counts[word] || 0) + 1);
  
        if (Math.max(...Object.values(counts)) / words.length > 0.35) {
          reasons.push("High word repetition");
        }
      }
  
      if (
        review.rating !== null &&
        ((review.rating >= 4 && review.sentiment === "negative") ||
         (review.rating <= 2 && review.sentiment === "positive"))
      ) {
        reasons.push("Rating and text sentiment disagree");
      }
  
      review.flagReasons = reasons;
      review.flagged = reasons.length > 0;
    }
  
    function processReview(review) {
      analyzeSentiment(review);
      detectReviewRisks(review);
      return review;
    }
  
    function mergeReviews(newReviews) {
      const map = new Map(state.reviews.map((review) => [review.id, review]));
  
      newReviews.forEach((review) => {
        const processed = processReview(review);
        map.set(processed.id, processed);
      });
  
      state.reviews = Array.from(map.values());
    }
  
    function countSentiments(reviews) {
      return {
        positive: reviews.filter((r) => r.sentiment === "positive").length,
        neutral: reviews.filter((r) => r.sentiment === "neutral").length,
        negative: reviews.filter((r) => r.sentiment === "negative").length
      };
    }
  
    function percent(value, total) {
      return total ? Math.round(value / total * 100) : 0;
    }
  
    function getVerdict(counts, total) {
      if (total < 3) {
        return {
          title: "Insufficient Evidence",
          note: "Collect at least three reviews before generating a broad verdict."
        };
      }
  
      const positiveRate = counts.positive / total;
      const negativeRate = counts.negative / total;
  
      if (negativeRate >= 0.4) {
        return { title: "Needs Caution", note: "A substantial share of analyzed reviews expresses negative sentiment." };
      }
  
      if (positiveRate >= 0.7 && negativeRate < 0.2) {
        return { title: "Mostly Positive", note: "Most analyzed reviews lean positive. Check recurring complaints too." };
      }
  
      if (negativeRate >= 0.2 || positiveRate < 0.55) {
        return { title: "Mixed Feedback", note: "Customer feedback is mixed. Review the pros and cons below." };
      }
  
      return { title: "Generally Positive", note: "The analyzed reviews lean positive." };
    }
  
    function analyzeAspects(reviews) {
      const results = [];
  
      for (const [aspect, keywords] of Object.entries(ASPECTS)) {
        const matching = reviews.filter((review) => {
          const text = `${review.title} ${review.text}`.toLowerCase();
          return keywords.some((keyword) => text.includes(keyword));
        });
  
        if (!matching.length) continue;
  
        const counts = countSentiments(matching);
  
        results.push({
          aspect,
          total: matching.length,
          positive: counts.positive,
          neutral: counts.neutral,
          negative: counts.negative,
          sentiment: counts.positive > counts.negative
            ? "positive"
            : counts.negative > counts.positive
              ? "negative"
              : "neutral"
        });
      }
  
      return results.sort((a, b) => b.total - a.total);
    }
  
    function generateProsAndCons(aspects) {
      const pros = aspects
        .filter((a) => a.total >= 2 && a.positive > a.negative)
        .slice(0, 5)
        .map((a) => `${a.aspect} (${a.positive}/${a.total} matching reviews positive)`);
  
      const cons = aspects
        .filter((a) => a.total >= 2 && a.negative > a.positive)
        .slice(0, 5)
        .map((a) => `${a.aspect} (${a.negative}/${a.total} matching reviews negative)`);
  
      return {
        pros: pros.length ? pros : ["Not enough repeated positive aspect mentions yet."],
        cons: cons.length ? cons : ["No recurring complaint identified yet."]
      };
    }
  
    function renderSentiment(counts, total) {
      return [
        ["Positive", counts.positive, "positive"],
        ["Neutral", counts.neutral, "neutral"],
        ["Negative", counts.negative, "negative"]
      ].map(([label, count, css]) => {
        const p = percent(count, total);
        return `
          <div class="era-bar-row">
            <div class="era-bar-label"><span>${label}</span><span>${count} (${p}%)</span></div>
            <div class="era-track"><div class="era-fill era-${css}" style="width:${p}%"></div></div>
          </div>`;
      }).join("");
    }
  
    function renderAspects(aspects) {
      if (!aspects.length) {
        return '<div class="era-card era-muted">No matching product aspects found yet.</div>';
      }
  
      return aspects.map((a) => `
        <div class="era-aspect-card">
          <div class="era-aspect-title">${escapeHTML(a.aspect)}</div>
          <span class="era-badge era-badge-${a.sentiment}">${escapeHTML(a.sentiment.toUpperCase())}</span>
          <div class="era-muted" style="margin-top:5px">
            Matching reviews: ${a.total}<br>
            Positive: ${a.positive} · Neutral: ${a.neutral} · Negative: ${a.negative}
          </div>
        </div>`).join("");
    }
  
    function renderList(selector, items) {
      $(selector).innerHTML = items.map((item) => `<li>${escapeHTML(item)}</li>`).join("");
    }
  
    function renderRisks(reviews) {
      const flagged = reviews.filter((review) => review.flagged);
  
      if (!flagged.length) {
        return '<div class="era-muted">No heuristic risk indicators found. This does not prove that every review is genuine.</div>';
      }
  
      return `
        <div class="era-muted" style="margin-bottom:8px">
          ${flagged.length} review(s) have possible risk indicators. These are not proof of fake reviews.
        </div>
        ${flagged.slice(0, 8).map((r) => `
          <div style="padding:7px 0;border-top:1px solid #e2e8f0">
            <strong>${escapeHTML(r.title || "Untitled review")}</strong>
            <div class="era-muted">${escapeHTML(r.flagReasons.join(", "))}</div>
          </div>`).join("")}`;
    }
  
    function renderReviews(reviews) {
      let filtered = reviews;
  
      if (state.filter === "flagged") {
        filtered = reviews.filter((r) => r.flagged);
      } else if (state.filter !== "all") {
        filtered = reviews.filter((r) => r.sentiment === state.filter);
      }
  
      if (!filtered.length) {
        $("#era-reviews").innerHTML = '<div class="era-empty">No reviews match this filter yet.</div>';
        return;
      }
  
      $("#era-reviews").innerHTML = filtered.map((r) => `
        <div class="era-review">
          <div class="era-review-title">${escapeHTML(r.title || "Customer review")}</div>
          <div style="margin:4px 0">
            <span class="era-badge era-badge-${r.sentiment}">${escapeHTML(r.sentiment.toUpperCase())}</span>
            ${r.rating !== null ? `<span style="margin-left:5px;color:#b45309">${escapeHTML(r.rating)} / 5 stars</span>` : ""}
            ${r.flagged ? '<span class="era-badge era-badge-negative">POTENTIAL FLAG</span>' : ""}
          </div>
          <div class="era-review-text">${escapeHTML(r.text)}</div>
          <div class="era-review-meta">
            ${escapeHTML(r.author || "Customer")}
            ${r.date ? " · " + escapeHTML(r.date) : ""}
            ${r.verified ? " · Verified purchase" : ""}
          </div>
          ${r.flagReasons.length ? `<div class="era-muted" style="margin-top:5px">Indicators: ${escapeHTML(r.flagReasons.join(", "))}</div>` : ""}
        </div>`).join("");
    }
  
    function updateDashboard() {
      state.product = getProductTitle();
      state.category = detectCategory(state.product);
  
      $("#era-product").textContent = state.product;
      $("#era-category").textContent = `Detected category: ${state.category}`;
      $("#era-product-rating").textContent = getProductRating();
  
      const reviews = state.reviews;
      const counts = countSentiments(reviews);
      const verdict = getVerdict(counts, reviews.length);
      const aspects = analyzeAspects(reviews);
      const prosCons = generateProsAndCons(aspects);
  
      $("#era-count").textContent = reviews.length;
      $("#era-positive-count").textContent = `${percent(counts.positive, reviews.length)}%`;
      $("#era-flags").textContent = reviews.filter((r) => r.flagged).length;
  
      $("#era-verdict").textContent = verdict.title;
      $("#era-verdict-note").textContent = verdict.note;
      $("#era-sentiment").innerHTML = renderSentiment(counts, reviews.length);
      $("#era-aspects").innerHTML = renderAspects(aspects);
      renderList("#era-pros", prosCons.pros);
      renderList("#era-cons", prosCons.cons);
      $("#era-risks").innerHTML = renderRisks(reviews);
      renderReviews(reviews);
    }
  
    function scanReviews() {
      if (!window.__ERA_RUNNING__) return;
  
      const found = collectVisibleReviews();
      mergeReviews(found);
      updateDashboard();
  
      console.log(
        `[Review Intelligence] Found ${found.length} review(s); total unique reviews: ${state.reviews.length}.`
      );
    }
  
    function exportJSON() {
      const reviews = state.reviews;
      const counts = countSentiments(reviews);
      const aspects = analyzeAspects(reviews);
      const prosCons = generateProsAndCons(aspects);
      const verdict = getVerdict(counts, reviews.length);
  
      const data = {
        product: getProductTitle(),
        category: detectCategory(getProductTitle()),
        productRating: getProductRating(),
        analyzedReviewCount: reviews.length,
        verdict,
        sentimentSummary: {
          ...counts,
          total: reviews.length,
          positivePercentage: percent(counts.positive, reviews.length),
          neutralPercentage: percent(counts.neutral, reviews.length),
          negativePercentage: percent(counts.negative, reviews.length)
        },
        aspects,
        pros: prosCons.pros,
        cons: prosCons.cons,
        potentialRiskCount: reviews.filter((r) => r.flagged).length,
        disclaimer: "Rule-based estimates from reviews loaded on the page. Potential flags are not proof of fake reviews.",
        reviews
      };
  
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
  
      link.href = url;
      link.download = "review-intelligence-analysis.json";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    }
  
    $("#era-refresh").addEventListener("click", scanReviews);
    $("#era-scan").addEventListener("click", scanReviews);
  
    $("#era-minimize").addEventListener("click", () => {
      panel.classList.toggle("era-minimized");
      $("#era-minimize").textContent = panel.classList.contains("era-minimized") ? "+" : "−";
    });
  
    $("#era-close").addEventListener("click", () => {
      window.__ERA_RUNNING__ = false;
      clearInterval(window.__ERA_TIMER__);
      window.__ERA_OBSERVER__?.disconnect();
      panel.remove();
    });
  
    $("#era-export").addEventListener("click", exportJSON);
  
    $$(".era-filter-btn").forEach((button) => {
      button.addEventListener("click", () => {
        state.filter = button.dataset.filter;
        $$(".era-filter-btn").forEach((b) => b.classList.toggle("active", b === button));
        renderReviews(state.reviews);
      });
    });
  
    scanReviews();
  
    window.__ERA_TIMER__ = setInterval(scanReviews, 3000);
  
    window.__ERA_OBSERVER__ = new MutationObserver(() => {
      if (window.__ERA_SCAN_PENDING__) return;
  
      window.__ERA_SCAN_PENDING__ = true;
  
      setTimeout(() => {
        window.__ERA_SCAN_PENDING__ = false;
        scanReviews();
      }, 1200);
    });
  
    window.__ERA_OBSERVER__.observe(document.body, {
      childList: true,
      subtree: true
    });
  
    console.log("[Review Intelligence] Extension initialized.");
  })();
  