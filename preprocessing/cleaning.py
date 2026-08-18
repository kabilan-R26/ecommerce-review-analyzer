import re
import logging
from dataclasses import dataclass
from pathlib import Path

import pandas as pd

# --------------------------------------------------------------------------
# 1. Logging setup (replaces ad-hoc print statements)
# --------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("text_cleaner")


# --------------------------------------------------------------------------
# 2. Config — flip these on/off instead of editing the cleaning logic
# --------------------------------------------------------------------------
@dataclass
class CleaningConfig:
    lowercase: bool = True
    expand_contractions: bool = True
    remove_urls: bool = True
    remove_html: bool = True
    remove_emojis: bool = True
    remove_punctuation: bool = True
    remove_numbers: bool = False          # keep numbers by default (e.g. "5 stars")
    reduce_repeated_chars: bool = True    # "soooo good" -> "so good"
    remove_stopwords: bool = False        # requires nltk; off by default (safe fallback)
    lemmatize: bool = False               # requires nltk; off by default (safe fallback)
    min_word_length: int = 1              # drop very short tokens if > 1


# --------------------------------------------------------------------------
# 3. Small, focused helper functions (each does ONE job -> easy to read/test)
# --------------------------------------------------------------------------
CONTRACTIONS = {
    "don't": "do not", "won't": "will not", "can't": "cannot",
    "n't": " not", "'re": " are", "'s": " is", "'d": " would",
    "'ll": " will", "'ve": " have", "'m": " am",
}

def expand_contractions(text: str) -> str:
    for contraction, expansion in CONTRACTIONS.items():
        text = text.replace(contraction, expansion)
    return text

def remove_urls(text: str) -> str:
    return re.sub(r"http\S+|www\.\S+", " ", text)

def remove_html_tags(text: str) -> str:
    text = re.sub(r"<.*?>", " ", text)          # tags like <br>
    text = re.sub(r"&\w+;", " ", text)           # entities like &amp;
    return text

def remove_emojis(text: str) -> str:
    emoji_pattern = re.compile(
        "[" 
        "\U0001F300-\U0001FAFF"  # symbols & pictographs, emojis
        "\U00002600-\U000027BF"  # misc symbols/dingbats
        "]+", flags=re.UNICODE
    )
    return emoji_pattern.sub(" ", text)

def remove_punctuation(text: str, keep_numbers: bool = True) -> str:
    pattern = r"[^a-zA-Z\s]" if not keep_numbers else r"[^a-zA-Z0-9\s]"
    return re.sub(pattern, " ", text)

def remove_numbers(text: str) -> str:
    return re.sub(r"\d+", " ", text)

def reduce_repeated_chars(text: str) -> str:
    # "soooo good" -> "soo good" -> avoids collapsing legit double letters like "book"
    return re.sub(r"(.)\1{2,}", r"\1\1", text)

def collapse_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


# --------------------------------------------------------------------------
# 4. Optional NLTK-based steps (stopwords / lemmatization) with safe fallback
# --------------------------------------------------------------------------
def _try_load_nltk_tools():
    """Attempts to load NLTK resources; returns (stopwords_set, lemmatizer) or (None, None)."""
    try:
        import nltk
        from nltk.corpus import stopwords
        from nltk.stem import WordNetLemmatizer

        for resource in ("stopwords", "wordnet", "omw-1.4"):
            try:
                nltk.data.find(f"corpora/{resource}")
            except LookupError:
                nltk.download(resource, quiet=True)

        return set(stopwords.words("english")), WordNetLemmatizer()
    except Exception as e:
        logger.warning(f"NLTK unavailable, skipping stopword/lemmatization steps ({e})")
        return None, None


# --------------------------------------------------------------------------
# 5. Main pipeline class — ties everything together
# --------------------------------------------------------------------------
class TextCleaner:
    def __init__(self, config: CleaningConfig = CleaningConfig()):
        self.config = config
        self.stopwords, self.lemmatizer = (
            _try_load_nltk_tools() if (config.remove_stopwords or config.lemmatize) else (None, None)
        )

    def clean(self, text: str) -> str:
        if not isinstance(text, str) or not text.strip():
            return ""

        cfg = self.config

        if cfg.lowercase:
            text = text.lower()
        if cfg.remove_urls:
            text = remove_urls(text)
        if cfg.remove_html:
            text = remove_html_tags(text)
        if cfg.remove_emojis:
            text = remove_emojis(text)
        if cfg.expand_contractions:
            text = expand_contractions(text)
        if cfg.remove_numbers:
            text = remove_numbers(text)
        if cfg.remove_punctuation:
            text = remove_punctuation(text, keep_numbers=not cfg.remove_numbers)
        if cfg.reduce_repeated_chars:
            text = reduce_repeated_chars(text)

        text = collapse_whitespace(text)

        # Token-level steps (stopwords / lemmatize / min length)
        if cfg.remove_stopwords or cfg.lemmatize or cfg.min_word_length > 1:
            tokens = text.split()
            if cfg.remove_stopwords and self.stopwords:
                tokens = [t for t in tokens if t not in self.stopwords]
            if cfg.lemmatize and self.lemmatizer:
                tokens = [self.lemmatizer.lemmatize(t) for t in tokens]
            if cfg.min_word_length > 1:
                tokens = [t for t in tokens if len(t) >= cfg.min_word_length]
            text = " ".join(tokens)

        return text


# --------------------------------------------------------------------------
# 6. Script entry point
# --------------------------------------------------------------------------
def main():
    input_path = Path("Data/reviews.csv")
    output_path = Path("Data/cleaned_reviews.csv")
    
    if not input_path.exists():
        logger.error(f"Input file not found: {input_path.resolve()}")
        return

    logger.info(f"Loading dataset from {input_path} ...")
    df = pd.read_csv(input_path)

    before = len(df)
    df = df.dropna(subset=["Text"])
    logger.info(f"Dropped {before - len(df)} rows with missing 'Text' ({len(df)} remain)")

    cleaner = TextCleaner(CleaningConfig(
        remove_stopwords=False,   # set True if you want stopwords removed
        lemmatize=False,          # set True if you want lemmatization
    ))

    logger.info("Cleaning review text...")
    df["Cleaned_Text"] = df["Text"].apply(cleaner.clean)

    # Drop rows that became empty after cleaning (e.g. text was just a URL/emoji)
    empty_after_cleaning = (df["Cleaned_Text"].str.len() == 0).sum()
    if empty_after_cleaning:
        logger.warning(f"{empty_after_cleaning} rows became empty after cleaning")

    df.to_csv(output_path, index=False)
    logger.info(f"Saved cleaned dataset to {output_path}")

    print("\nDATA CLEANING COMPLETED!\n")
    print("BEFORE AND AFTER CLEANING (first 5 examples):\n")
    for i in range(min(5, len(df))):
        print("Original :", df["Text"].iloc[i])
        print("Cleaned  :", df["Cleaned_Text"].iloc[i])
        print("=" * 70)

    print(f"\nTotal reviews cleaned: {len(df)}")


if __name__ == "__main__":
    main()