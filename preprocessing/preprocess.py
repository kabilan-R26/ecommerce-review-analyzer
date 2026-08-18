import re
import logging
from pathlib import Path

import pandas as pd
from tqdm import tqdm

import nltk
from nltk.corpus import stopwords
from nltk.stem import WordNetLemmatizer


# ============================================================
# CONFIGURATION
# ============================================================

INPUT_FILE = Path("Data/cleaned_reviews.csv")
OUTPUT_FILE = Path("Data/final_preprocessed_reviews.csv")

# Smaller chunk = lower RAM usage
CHUNK_SIZE = 2_000


# ============================================================
# LOGGING
# ============================================================

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    datefmt="%H:%M:%S",
)

logger = logging.getLogger("review_preprocessor")


# ============================================================
# NLTK SETUP
# ============================================================

def setup_nltk():

    resources = [
        ("corpora/stopwords", "stopwords"),
        ("corpora/wordnet", "wordnet"),
    ]

    for resource_path, package in resources:

        try:
            nltk.data.find(resource_path)

        except LookupError:

            logger.info(
                f"Downloading NLTK resource: {package}"
            )

            nltk.download(package, quiet=True)


setup_nltk()


# ============================================================
# STOPWORDS
# ============================================================

ALL_STOPWORDS = set(
    stopwords.words("english")
)

# Preserve sentiment-important negation words
NEGATION_WORDS = {
    "no",
    "not",
    "never",
    "neither",
    "nor",
    "cannot",
    "cant",
    "don't",
    "doesn't",
    "didn't",
    "isn't",
    "wasn't",
    "weren't",
    "won't",
    "wouldn't",
    "couldn't",
    "shouldn't",
    "haven't",
    "hasn't",
    "hadn't",
}

SENTIMENT_STOPWORDS = (
    ALL_STOPWORDS - NEGATION_WORDS
)


# ============================================================
# LEMMATIZER
# ============================================================

lemmatizer = WordNetLemmatizer()


# ============================================================
# NORMALIZATION
# ============================================================

def normalize_text(text):

    if not isinstance(text, str):
        return ""

    text = text.lower()

    text = text.replace("’", "'")

    # Remove URLs
    text = re.sub(
        r"https?://\S+|www\.\S+",
        " ",
        text
    )

    # Remove HTML
    text = re.sub(
        r"<.*?>",
        " ",
        text
    )

    # Keep alphabetic characters
    text = re.sub(
        r"[^a-z\s]",
        " ",
        text
    )

    # Remove extra whitespace
    text = re.sub(
        r"\s+",
        " ",
        text
    ).strip()

    return text


# ============================================================
# TOKENIZATION
# ============================================================

def tokenize(text):

    return re.findall(
        r"\b[a-z]+\b",
        text
    )


# ============================================================
# STOPWORD REMOVAL
# ============================================================

def remove_stopwords(tokens):

    return [
        token
        for token in tokens
        if token not in SENTIMENT_STOPWORDS
    ]


# ============================================================
# LEMMATIZATION
# ============================================================

def lemmatize_tokens(tokens):

    return [
        lemmatizer.lemmatize(token)
        for token in tokens
    ]


# ============================================================
# TOKEN FILTERING
# ============================================================

def filter_tokens(tokens):

    return [
        token
        for token in tokens
        if len(token) >= 2
    ]


# ============================================================
# COMPLETE PREPROCESSING
# ============================================================

def preprocess_text(text):

    if not isinstance(text, str):
        return ""

    if not text.strip():
        return ""

    # Normalize
    text = normalize_text(text)

    # Tokenize
    tokens = tokenize(text)

    # Remove stopwords
    tokens = remove_stopwords(tokens)

    # Lemmatize
    tokens = lemmatize_tokens(tokens)

    # Remove very short words
    tokens = filter_tokens(tokens)

    return " ".join(tokens)


# ============================================================
# PROCESS CHUNK
# ============================================================

def process_chunk(df):

    tqdm.pandas(
        desc="NLP preprocessing",
        leave=False
    )

    df["Preprocessed_Text"] = (
        df["Cleaned_Text"]
        .fillna("")
        .progress_apply(preprocess_text)
    )

    # Remove empty processed reviews
    df = df[
        df["Preprocessed_Text"]
        .str.strip()
        .ne("")
    ].copy()

    return df


# ============================================================
# MAIN
# ============================================================

def main():

    if not INPUT_FILE.exists():

        logger.error(
            f"Input file not found: "
            f"{INPUT_FILE.resolve()}"
        )

        return


    logger.info(
        f"Input file: {INPUT_FILE}"
    )

    logger.info(
        f"Output file: {OUTPUT_FILE}"
    )

    logger.info(
        f"Chunk size: {CHUNK_SIZE:,}"
    )


    # --------------------------------------------------------
    # Delete previous incomplete output
    # --------------------------------------------------------

    if OUTPUT_FILE.exists():

        OUTPUT_FILE.unlink()

        logger.info(
            "Previous incomplete output removed."
        )


    # --------------------------------------------------------
    # Only load columns required for NLP/project
    # --------------------------------------------------------

    USE_COLUMNS = [
        "ProductId",
        "UserId",
        "ProfileName",
        "Score",
        "Summary",
        "Text",
        "Time",
        "HelpfulnessNumerator",
        "HelpfulnessDenominator",
        "Cleaned_Text",
    ]


    logger.info(
        "Starting memory-efficient preprocessing..."
    )


    total = 0
    final_count = 0
    removed = 0

    first_chunk = True


    # --------------------------------------------------------
    # Read CSV in small chunks
    # --------------------------------------------------------

    reader = pd.read_csv(
        INPUT_FILE,
        usecols=USE_COLUMNS,
        chunksize=CHUNK_SIZE,
        engine="python",
    )


    # --------------------------------------------------------
    # Process chunks
    # --------------------------------------------------------

    for chunk_number, chunk in enumerate(
        reader,
        start=1
    ):

        total += len(chunk)

        logger.info(
            f"Processing chunk {chunk_number} "
            f"| Reviews loaded: {total:,}"
        )


        before = len(chunk)

        chunk = process_chunk(chunk)

        removed += before - len(chunk)

        final_count += len(chunk)


        # ----------------------------------------------------
        # Append processed chunk to output
        # ----------------------------------------------------

        chunk.to_csv(
            OUTPUT_FILE,
            mode="w" if first_chunk else "a",
            header=first_chunk,
            index=False
        )

        first_chunk = False


        logger.info(
            f"Chunk {chunk_number} completed "
            f"| Final reviews: {final_count:,}"
        )


    # ========================================================
    # FINAL REPORT
    # ========================================================

    print()
    print("=" * 75)
    print("TEXT PREPROCESSING COMPLETED")
    print("=" * 75)

    print(
        f"Original reviews       : {total:,}"
    )

    print(
        f"Final processed reviews: {final_count:,}"
    )

    print(
        f"Removed reviews        : {removed:,}"
    )

    print(
        f"Output file            : "
        f"{OUTPUT_FILE}"
    )

    print("=" * 75)


    # ========================================================
    # SHOW SAMPLE
    # ========================================================

    if OUTPUT_FILE.exists():

        print()
        print("BEFORE → AFTER EXAMPLES")
        print("=" * 75)

        sample = pd.read_csv(
            OUTPUT_FILE,
            nrows=5
        )

        for _, row in sample.iterrows():

            print("\nORIGINAL:")
            print(row["Text"])

            print("\nCLEANED:")
            print(row["Cleaned_Text"])

            print("\nPREPROCESSED:")
            print(row["Preprocessed_Text"])

            print("-" * 75)


# ============================================================
# RUN
# ============================================================

if __name__ == "__main__":
    main()