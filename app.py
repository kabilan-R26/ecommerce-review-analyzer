
import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from sentence_transformers import SentenceTransformer
import joblib

app = Flask(__name__)
CORS(app)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(BASE_DIR, "model_files")

CLASSIFIER_PATH = os.path.join(
    MODEL_DIR, "sentiment_classifier.pkl"
)
EMBEDDING_NAME_PATH = os.path.join(
    MODEL_DIR, "embedding_model_name.txt"
)

print("Loading trained classifier...")

classifier = joblib.load(CLASSIFIER_PATH)

with open(EMBEDDING_NAME_PATH, "r", encoding="utf-8") as file:
    embedding_model_name = file.read().strip()

print("Loading sentence embedding model...")

embedding_model = SentenceTransformer(embedding_model_name)

print("Models loaded successfully!")


@app.route("/", methods=["GET"])
def home():
    return jsonify({
        "message": "E-Commerce Review Analyzer API is running"
    })


@app.route("/predict", methods=["POST"])
def predict():
    data = request.get_json(silent=True) or {}
    reviews = data.get("reviews")

    if not isinstance(reviews, list) or not reviews:
        return jsonify({
            "error": "Please provide a non-empty reviews list"
        }), 400

    if len(reviews) > 500:
        return jsonify({
            "error": "Send at most 500 reviews per request"
        }), 400

    if not all(isinstance(review, str) for review in reviews):
        return jsonify({
            "error": "Every review must be a string"
        }), 400

    if any(len(review) > 20000 for review in reviews):
        return jsonify({
            "error": "Each review must be at most 20000 characters"
        }), 400

    valid_reviews = [review.strip() for review in reviews]

    if any(not review for review in valid_reviews):
        return jsonify({
            "error": "Reviews cannot be empty"
        }), 400

    embeddings = embedding_model.encode(
        valid_reviews,
        batch_size=32,
        convert_to_numpy=True,
        normalize_embeddings=True
    )

    predictions = classifier.predict(embeddings)
    probabilities = classifier.predict_proba(embeddings)

    results = []

    for review, sentiment, scores in zip(
        valid_reviews, predictions, probabilities
    ):
        results.append({
            "review": review,
            "sentiment": str(sentiment),
            "confidence": round(float(max(scores)) * 100, 2)
        })

    counts = {
        "positive": 0,
        "neutral": 0,
        "negative": 0
    }

    for result in results:
        counts[result["sentiment"]] += 1

    return jsonify({
        "total": len(results),
        "sentiment_counts": counts,
        "predictions": results
    })


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=False)
