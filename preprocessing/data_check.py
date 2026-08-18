import pandas as pd

# Load the review dataset
df = pd.read_csv(r"D:\TEXT MINING\ecommerce-review-analyzer\Data\reviews.csv")

# Show the first 5 reviews
print("FIRST 5 REVIEWS:")
print(df.head())

# Show column names
print("\nCOLUMNS:")
print(df.columns.tolist())

# Show number of rows and columns
print("\nDATASET SHAPE:")
print(df.shape)

# Check missing values
print("\nMISSING VALUES:")
print(df.isnull().sum())