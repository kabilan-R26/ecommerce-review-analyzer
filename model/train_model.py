
import os
import time
import joblib
import pandas as pd
import numpy as np

from sentence_transformers import SentenceTransformer
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix
)

# ==================================================
# 1. CONFIGURATION
# ==================================================

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

DATA_PATH = os.path.join(BASE_DIR, "Data", "reviews.csv")
OUTPUT_DIR = os.path.join(BASE_DIR, "model_files")

MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
MAX_REVIEWS = 100_000
BATCH_SIZE = 128
RANDOM_STATE = 42

os.makedirs(OUTPUT_DIR, exist_ok=True)

CLASSIFIER_PATH = os.path.join(
    OUTPUT_DIR, "sentiment_classifier.pkl"
)

EMBEDDING_MODEL_PATH = os.path.join(
    OUTPUT_DIR, "embedding_model_name.txt"
)

print("=" * 60)
print(" E-COMMERCE REVIEW SENTIMENT ANALYZER")
print(" Sentence Embeddings + Logistic Regression")
print("=" * 60)

# ==================================================
# 2. LOAD DATASET
# ==================================================

if not os.path.exists(DATA_PATH):
    raise FileNotFoundError(
        f"Dataset not found: {DATA_PATH}"
    )

print("\nLoading review dataset...")

df = pd.read_csv(
    DATA_PATH,
    usecols=["Score", "Text"],
    low_memory=False
)

print("Original rows:", len(df))

# ==================================================
# 3. CLEAN AND LABEL REVIEWS
# ==================================================

print("\nPreparing review text and sentiment labels...")

df["Score"] = pd.to_numeric(df["Score"], errors="coerce")
df["Text"] = df["Text"].fillna("").astype(str).str.strip()

df = df.dropna(subset=["Score"])
df = df[df["Text"] != ""]
df = df[df["Score"].between(1, 5)]

def get_sentiment(score):
    if score <= 2:
        return "negative"
    elif score == 3:
        return "neutral"
    return "positive"

df["Sentiment"] = df["Score"].apply(get_sentiment)

# Remove duplicate review text to reduce redundant training examples.
df = df.drop_duplicates(subset=["Text"])

print("\nAvailable reviews by sentiment:")
print(df["Sentiment"].value_counts())

# ==================================================
# 4. SELECT A STRATIFIED SAMPLE
# ==================================================

if len(df) > MAX_REVIEWS:
    print(f"\nSampling {MAX_REVIEWS:,} reviews...")

    df, _ = train_test_split(
        df,
        train_size=MAX_REVIEWS,
        random_state=RANDOM_STATE,
        stratify=df["Sentiment"]
    )

df = df.reset_index(drop=True)

texts = df["Text"].tolist()
labels = df["Sentiment"].to_numpy()

print("Reviews selected:", len(texts))

# ==================================================
# 5. SPLIT DATA BEFORE TRAINING
# ==================================================

indices = np.arange(len(texts))

train_idx, test_idx = train_test_split(
    indices,
    test_size=0.20,
    random_state=RANDOM_STATE,
    stratify=labels
)

train_texts = [texts[i] for i in train_idx]
test_texts = [texts[i] for i in test_idx]

y_train = labels[train_idx]
y_test = labels[test_idx]

print("Training reviews:", len(train_texts))
print("Testing reviews:", len(test_texts))

# ==================================================
# 6. LOAD PRETRAINED EMBEDDING MODEL
# ==================================================

print("\nLoading sentence embedding model...")
print("The first run may download model files.")

device = "cuda" if __import__("torch").cuda.is_available() else "cpu"
print("Selected device:", device)

embedding_model = SentenceTransformer(
    MODEL_NAME,
    device=device
)

# ==================================================
# 7. GENERATE EMBEDDINGS
# ==================================================

print("\nGenerating training embeddings...")
start_time = time.time()

X_train = embedding_model.encode(
    train_texts,
    batch_size=BATCH_SIZE,
    show_progress_bar=True,
    convert_to_numpy=True,
    normalize_embeddings=True
)

print("\nGenerating testing embeddings...")

X_test = embedding_model.encode(
    test_texts,
    batch_size=BATCH_SIZE,
    show_progress_bar=True,
    convert_to_numpy=True,
    normalize_embeddings=True
)

print(
    f"\nEmbedding generation completed in "
    f"{(time.time() - start_time) / 60:.2f} minutes."
)

print("Training embedding shape:", X_train.shape)
print("Testing embedding shape:", X_test.shape)

# ==================================================
# 8. TRAIN CLASSIFIER ON EMBEDDINGS
# ==================================================

print("\nTraining Logistic Regression classifier...")

classifier = LogisticRegression(
    max_iter=500,
    solver="lbfgs",
    random_state=RANDOM_STATE
)

classifier.fit(X_train, y_train)

print("Classifier training completed!")

# ==================================================
# 9. EVALUATE THE MODEL
# ==================================================

print("\nEvaluating model on unseen reviews...")

predictions = classifier.predict(X_test)

accuracy = accuracy_score(y_test, predictions)

print("\n" + "=" * 60)
print(" MODEL EVALUATION")
print("=" * 60)

print(f"\nTest accuracy: {accuracy:.4f}")
print(f"Test accuracy percentage: {accuracy * 100:.2f}%")

print("\nClassification report:")
print(
    classification_report(
        y_test,
        predictions,
        labels=["negative", "neutral", "positive"],
        zero_division=0
    )
)

print("Confusion matrix (negative, neutral, positive):")
print(
    confusion_matrix(
        y_test,
        predictions,
        labels=["negative", "neutral", "positive"]
    )
)

# ==================================================
# 10. SAVE CLASSIFIER AND EMBEDDING MODEL NAME
# ==================================================

print("\nSaving trained classifier...")

joblib.dump(
    classifier,
    CLASSIFIER_PATH,
    compress=3
)

with open(EMBEDDING_MODEL_PATH, "w", encoding="utf-8") as file:
    file.write(MODEL_NAME)

print("Classifier saved:", CLASSIFIER_PATH)
print("Embedding model name saved:", EMBEDDING_MODEL_PATH)

# ==================================================
# 11. TEST NEW REVIEWS
# ==================================================

print("\nTesting sample reviews...")

sample_reviews = [
    "This product is excellent and works perfectly.",
    "The product is okay, nothing special.",
    "Very poor quality. I regret buying this product."
]

sample_embeddings = embedding_model.encode(
    sample_reviews,
    convert_to_numpy=True,
    normalize_embeddings=True
)

sample_predictions = classifier.predict(sample_embeddings)
sample_probabilities = classifier.predict_proba(sample_embeddings)

for review, sentiment, probabilities in zip(
    sample_reviews,
    sample_predictions,
    sample_probabilities
):
    confidence = max(probabilities) * 100

    print("\nReview:", review)
    print("Predicted sentiment:", sentiment)
    print(f"Classifier confidence: {confidence:.2f}%")

print("\n" + "=" * 60)
print(" EMBEDDING-BASED TRAINING COMPLETED!")
print("=" * 60)
