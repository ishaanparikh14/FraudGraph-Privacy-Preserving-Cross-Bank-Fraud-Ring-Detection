"""
rebuild_model.py
Trains a standard sklearn RandomForestClassifier on synthetic data that matches
the inference feature schema: [amount, velocity, time_delta, freq_ratio].
Saves the model as dp_rf_model.joblib so kafka_scorer.py can load it.

Run with: .\.venv\Scripts\python rebuild_model.py
"""
import numpy as np
import joblib
from sklearn.ensemble import RandomForestClassifier

rng = np.random.default_rng(42)
N = 20_000
FRAUD_RATE = 0.03  # 3% fraud

# Legitimate transactions
n_legit = int(N * (1 - FRAUD_RATE))
legit = np.column_stack([
    rng.exponential(scale=200, size=n_legit),      # amount
    rng.integers(1, 5, size=n_legit).astype(float), # velocity
    rng.exponential(scale=5, size=n_legit),         # time_delta
    rng.uniform(0.5, 2.0, size=n_legit),            # freq_ratio
])
y_legit = np.zeros(n_legit)

# Fraudulent transactions (high amount, high velocity, low time_delta, extreme freq_ratio)
n_fraud = N - n_legit
fraud = np.column_stack([
    rng.exponential(scale=5000, size=n_fraud),      # amount – much higher
    rng.integers(5, 20, size=n_fraud).astype(float), # velocity – burst
    rng.uniform(0.01, 0.5, size=n_fraud),            # time_delta – very quick
    rng.uniform(10, 100, size=n_fraud),              # freq_ratio – imbalanced
])
y_fraud = np.ones(n_fraud)

X = np.vstack([legit, fraud])
y = np.concatenate([y_legit, y_fraud])

# Shuffle
idx = rng.permutation(len(y))
X, y = X[idx], y[idx]

print(f"Training on {len(y)} samples ({int(y.sum())} fraud)...")
model = RandomForestClassifier(n_estimators=100, max_depth=10, random_state=42, n_jobs=-1)
model.fit(X, y)

out_path = "dp_rf_model.joblib"
joblib.dump(model, out_path)
print(f"Model saved to {out_path}")
print("Done.")
