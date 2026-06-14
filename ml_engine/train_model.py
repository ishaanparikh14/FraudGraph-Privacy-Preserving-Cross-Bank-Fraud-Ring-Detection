import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.metrics import precision_recall_curve, auc, classification_report
import diffprivlib.models as dp
from sklearn.ensemble import RandomForestClassifier as SklearnRF
import matplotlib.pyplot as plt
import joblib
import time
from features import engineer_training_features

DATA_PATH = '../data/PS_20174392719_1491204439457_log.csv'
MODEL_OUTPUT = 'dp_rf_model.joblib'
REPORT_OUTPUT = 'benchmark_report.txt'
PR_CURVE_OUTPUT = 'pr_curve.png'

def main():
    print(f"Loading dataset from {DATA_PATH}...")
    start_time = time.time()
    
    # Read a sample to save memory during local training if dataset is huge
    # We read 1 million rows for decent training size out of 6M
    df = pd.read_csv(DATA_PATH, nrows=1000000)
    print(f"Loaded {len(df)} rows in {time.time() - start_time:.2f}s")
    
    print("Engineering features...")
    X, y = engineer_training_features(df)
    
    print(f"Feature engineering complete. Target shape: {y.shape}, Fraud cases: {y.sum()}")
    
    # Split data
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, stratify=y, random_state=42)
    
    # 1. Train Non-Private Baseline
    print("Training non-private Sklearn baseline...")
    baseline_rf = SklearnRF(n_estimators=50, max_depth=10, random_state=42, n_jobs=-1)
    baseline_rf.fit(X_train, y_train)
    baseline_preds = baseline_rf.predict_proba(X_test)[:, 1]
    
    # 2. Train Differential Privacy Model
    print("Training IBM Diffprivlib Random Forest (epsilon=1.0)...")
    # bounds must be provided for DP models. 
    # Calculate bounds from training data min/max
    bounds = (X_train.min().values, X_train.max().values)
    
    dp_rf = dp.RandomForestClassifier(n_estimators=50, epsilon=1.0, bounds=bounds, random_state=42)
    dp_rf.fit(X_train, y_train)
    dp_preds = dp_rf.predict_proba(X_test)[:, 1]
    
    # Tune classification threshold for high recall
    threshold = 0.3 # Lower threshold increases recall
    dp_class_preds = (dp_preds >= threshold).astype(int)
    baseline_class_preds = (baseline_preds >= threshold).astype(int)
    
    print("Generating Benchmark Report...")
    with open(REPORT_OUTPUT, 'w') as f:
        f.write("FraudGraph Differential Privacy Benchmark Report\n")
        f.write("===============================================\n\n")
        f.write("Non-Private Baseline (Sklearn RF):\n")
        f.write(classification_report(y_test, baseline_class_preds))
        f.write("\n")
        f.write("Differentially Private Model (IBM diffprivlib, eps=1.0):\n")
        f.write(classification_report(y_test, dp_class_preds))
        f.write("\n")
        
    print(f"Report saved to {REPORT_OUTPUT}")
    
    # Generate PR Curve
    precision_dp, recall_dp, _ = precision_recall_curve(y_test, dp_preds)
    auc_dp = auc(recall_dp, precision_dp)
    
    precision_bl, recall_bl, _ = precision_recall_curve(y_test, baseline_preds)
    auc_bl = auc(recall_bl, precision_bl)
    
    plt.figure(figsize=(8, 6))
    plt.plot(recall_dp, precision_dp, label=f'DP RF (AUC = {auc_dp:.3f})', color='blue')
    plt.plot(recall_bl, precision_bl, label=f'Baseline RF (AUC = {auc_bl:.3f})', color='gray', linestyle='--')
    plt.xlabel('Recall')
    plt.ylabel('Precision')
    plt.title('Precision-Recall Curve: DP vs Baseline')
    plt.legend(loc='lower left')
    plt.grid(True)
    plt.savefig(PR_CURVE_OUTPUT)
    print(f"PR curve saved to {PR_CURVE_OUTPUT}")
    
    # Save the DP model for serving
    joblib.dump(dp_rf, MODEL_OUTPUT)
    print(f"Saved DP model to {MODEL_OUTPUT}")

if __name__ == '__main__':
    main()
