from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.services.stocks import STOCK_PRESETS, train_and_save_stock_model_artifact


def main() -> None:
    tickers = [item["ticker"] for item in STOCK_PRESETS]
    print("[stock-models] Starting pretrained stock model build", flush=True)

    for ticker in tickers:
        print(f"[stock-models] Training {ticker}", flush=True)
        artifact = train_and_save_stock_model_artifact(ticker)
        print(
            "[stock-models] Saved"
            f" {ticker} | best_epoch={artifact['bestEpoch']}"
            f" | val_rmse={artifact['validationRmse']}"
            f" | val_dir_acc={float(artifact['validationDirectionAccuracy']) * 100:.1f}%",
            flush=True,
        )

    print("[stock-models] Done", flush=True)


if __name__ == "__main__":
    main()
