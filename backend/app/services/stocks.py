from __future__ import annotations

import json
from datetime import datetime, timedelta
from importlib import import_module
from math import sqrt
from pathlib import Path

import numpy as np
import requests
import torch
from torch import nn
from torch.utils.data import DataLoader, TensorDataset

from app.schemas.stocks import StockNodePayload, StockTrainingRequest


STOCK_PRESETS = [
    {
        "ticker": "AAPL",
        "label": "Apple",
        "sector": "Consumer Tech",
        "description": "아이폰, 서비스 매출, 하드웨어 사이클이 함께 움직여서 추세 관찰 연습에 자주 쓰이는 대표 종목입니다.",
    },
    {
        "ticker": "MSFT",
        "label": "Microsoft",
        "sector": "Cloud Software",
        "description": "클라우드와 엔터프라이즈 소프트웨어 수요가 반영되어 비교적 매끈한 중장기 흐름을 보이는 편입니다.",
    },
    {
        "ticker": "NVDA",
        "label": "NVIDIA",
        "sector": "AI Semiconductors",
        "description": "AI 반도체 기대감이 가격에 빠르게 반영되어 변동성과 모멘텀이 함께 큰 주가 패턴을 보여줍니다.",
    },
    {
        "ticker": "TSLA",
        "label": "Tesla",
        "sector": "EV Mobility",
        "description": "고변동 성장주 성격이 강해서 예측 난도가 높고, 시계열 모델의 한계를 체감하기 좋은 종목입니다.",
    },
]

STOCK_HISTORY_CACHE_TTL = timedelta(minutes=20)
STOCK_HISTORY_CACHE: dict[tuple[str, str], tuple[datetime, list[str], np.ndarray]] = {}
STOCK_MODEL_DIR = Path(__file__).resolve().parents[2] / "data" / "stock_models"


class StockLSTM(nn.Module):
    def __init__(self, lstm_layers: list[dict[str, int]], head_layers: list[nn.Module]) -> None:
        super().__init__()
        self.sequence_layers = nn.ModuleList(
            [
                nn.LSTM(
                    input_size=layer["input_size"],
                    hidden_size=layer["hidden_size"],
                    num_layers=layer["num_layers"],
                    batch_first=True,
                )
                for layer in lstm_layers
            ]
        )
        self.head = nn.Sequential(*head_layers)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        sequence = x
        for layer in self.sequence_layers:
            sequence, _ = layer(sequence)
        features = sequence[:, -1, :]
        return self.head(features)


def list_stock_presets() -> list[dict[str, str]]:
    return STOCK_PRESETS


def search_stocks(query: str) -> list[dict[str, str]]:
    normalized_query = query.strip()
    if not normalized_query:
        return STOCK_PRESETS

    local_matches = [
        item
        for item in STOCK_PRESETS
        if normalized_query.lower() in item["ticker"].lower()
        or normalized_query.lower() in item["label"].lower()
        or normalized_query.lower() in item["sector"].lower()
    ]

    try:
        response = requests.get(
            "https://query2.finance.yahoo.com/v1/finance/search",
            params={
                "q": normalized_query,
                "quotesCount": 8,
                "newsCount": 0,
                "listsCount": 0,
                "enableFuzzyQuery": False,
                "quotesQueryId": "tss_match_phrase_query",
                "multiQuoteQueryId": "multi_quote_single_token_query",
                "region": "US",
                "lang": "en-US",
            },
            timeout=8,
            headers={
                "User-Agent": "Mozilla/5.0 VisAIble Playground",
            },
        )
        response.raise_for_status()
        payload = response.json()
    except Exception:
        return local_matches[:8]

    quotes = payload.get("quotes", []) if isinstance(payload, dict) else []
    results: list[dict[str, str]] = []
    seen_tickers: set[str] = set()

    for quote in quotes:
        if not isinstance(quote, dict):
            continue
        symbol = str(quote.get("symbol") or "").upper().strip()
        if not symbol or symbol in seen_tickers:
            continue
        if quote.get("quoteType") not in {"EQUITY", "ETF"}:
            continue

        short_name = str(quote.get("shortname") or quote.get("longname") or symbol).strip()
        sector = str(quote.get("sector") or quote.get("exchangeDisp") or "Market").strip()
        results.append(
            {
                "ticker": symbol,
                "label": short_name,
                "sector": sector,
                "description": f"{short_name} ({symbol}) 종목을 Yahoo Finance 검색 결과에서 불러왔습니다.",
            }
        )
        seen_tickers.add(symbol)

    for item in local_matches:
        ticker = item["ticker"]
        if ticker in seen_tickers:
            continue
        results.append(item)
        seen_tickers.add(ticker)

    return results[:8]


def train_and_save_stock_model_artifact(
    ticker: str,
    *,
    lookback_window: int = 30,
    validation_samples: int = 36,
    max_epochs: int = 72,
    batch_size: int = 32,
    hidden_size: int = 64,
    num_layers: int = 2,
    dropout: float = 0.15,
    learning_rate: float = 0.001,
    period: str = "2y",
) -> dict[str, object]:
    normalized_ticker = ticker.upper()
    dates, prices = _load_stock_history(normalized_ticker, period=period)
    sample_count = len(prices) - lookback_window
    if sample_count <= validation_samples + 24:
        raise ValueError(f"{normalized_ticker}는 사전학습용 시퀀스를 만들기에 데이터가 부족합니다.")

    training_samples = sample_count - validation_samples
    training_prices = prices[: training_samples + lookback_window]
    min_price = float(training_prices.min())
    max_price = float(training_prices.max())
    scale = max(max_price - min_price, 1e-6)
    normalized_prices = (prices - min_price) / scale

    windows: list[np.ndarray] = []
    targets: list[float] = []
    target_dates: list[str] = []
    target_prices: list[float] = []

    for index in range(lookback_window, len(normalized_prices)):
        windows.append(normalized_prices[index - lookback_window:index].astype(np.float32))
        targets.append(float(normalized_prices[index]))
        target_dates.append(dates[index])
        target_prices.append(float(prices[index]))

    train_x = np.stack(windows[:training_samples]).reshape(training_samples, lookback_window, 1)
    train_y = np.asarray(targets[:training_samples], dtype=np.float32)
    val_x = np.stack(windows[training_samples:]).reshape(validation_samples, lookback_window, 1)
    val_y = np.asarray(targets[training_samples:], dtype=np.float32)

    train_dataset = TensorDataset(torch.tensor(train_x), torch.tensor(train_y))
    train_loader = DataLoader(
        train_dataset,
        batch_size=min(batch_size, training_samples),
        shuffle=True,
    )

    device = _get_stock_device()
    torch.manual_seed(42)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(42)

    model, architecture = _build_default_stock_model(
        hidden_size=hidden_size,
        num_layers=num_layers,
        dropout=dropout,
    )
    model = model.to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=learning_rate)
    loss_fn = nn.MSELoss()

    val_x_tensor = torch.tensor(val_x, dtype=torch.float32, device=device)
    val_y_tensor = torch.tensor(val_y, dtype=torch.float32, device=device)
    val_last_input_tensor = val_x_tensor[:, -1, 0]

    best_val_loss = float("inf")
    best_epoch = 0
    best_state = {name: tensor.detach().cpu().clone() for name, tensor in model.state_dict().items()}
    patience = 10
    stale_epochs = 0
    losses: list[dict[str, float | int]] = []

    for epoch in range(1, max_epochs + 1):
        model.train()
        running_loss = 0.0
        running_direction_accuracy = 0.0

        for batch_x, batch_y in train_loader:
            batch_x = batch_x.to(device)
            batch_y = batch_y.to(device)
            optimizer.zero_grad()
            predictions = model(batch_x).squeeze(-1)
            loss = loss_fn(predictions, batch_y)
            loss.backward()
            optimizer.step()
            running_loss += float(loss.item()) * batch_x.size(0)

            last_input = batch_x[:, -1, 0]
            running_direction_accuracy += _direction_accuracy(predictions.detach(), batch_y, last_input) * batch_x.size(0)

        train_loss = running_loss / training_samples
        train_direction_accuracy = running_direction_accuracy / training_samples

        model.eval()
        with torch.no_grad():
            validation_predictions = model(val_x_tensor).squeeze(-1)
            validation_loss = float(loss_fn(validation_predictions, val_y_tensor).item())
            validation_direction_accuracy = _direction_accuracy(
                validation_predictions,
                val_y_tensor,
                val_last_input_tensor,
            )

        losses.append(
            {
                "epoch": epoch,
                "trainLoss": round(train_loss, 6),
                "validationLoss": round(validation_loss, 6),
                "trainDirectionAccuracy": round(train_direction_accuracy, 4),
                "validationDirectionAccuracy": round(validation_direction_accuracy, 4),
            }
        )

        if validation_loss < best_val_loss - 1e-6:
            best_val_loss = validation_loss
            best_epoch = epoch
            best_state = {name: tensor.detach().cpu().clone() for name, tensor in model.state_dict().items()}
            stale_epochs = 0
        else:
            stale_epochs += 1

        if stale_epochs >= patience:
            break

    model.load_state_dict(best_state)
    model = model.to(device)
    model.eval()

    with torch.no_grad():
        train_predictions = model(torch.tensor(train_x, dtype=torch.float32, device=device)).squeeze(-1).cpu().numpy()
        validation_predictions = model(val_x_tensor).squeeze(-1).cpu().numpy()

    train_predictions_price = _inverse_scale(train_predictions, min_price, scale)
    train_actual_price = _inverse_scale(train_y, min_price, scale)
    validation_predictions_price = _inverse_scale(validation_predictions, min_price, scale)
    validation_actual_price = _inverse_scale(val_y, min_price, scale)
    validation_direction_accuracy = _direction_accuracy(
        torch.tensor(validation_predictions, dtype=torch.float32),
        torch.tensor(val_y, dtype=torch.float32),
        torch.tensor(val_x[:, -1, 0], dtype=torch.float32),
    )

    STOCK_MODEL_DIR.mkdir(parents=True, exist_ok=True)
    artifact_path = STOCK_MODEL_DIR / f"{normalized_ticker.lower()}.pt"
    metadata_path = STOCK_MODEL_DIR / f"{normalized_ticker.lower()}.json"

    artifact = {
        "ticker": normalized_ticker,
        "companyName": next((item["label"] for item in STOCK_PRESETS if item["ticker"] == normalized_ticker), normalized_ticker),
        "sector": next((item["sector"] for item in STOCK_PRESETS if item["ticker"] == normalized_ticker), "Market"),
        "period": period,
        "lookbackWindow": lookback_window,
        "hiddenSize": hidden_size,
        "numLayers": num_layers,
        "dropout": dropout,
        "learningRate": learning_rate,
        "batchSize": batch_size,
        "epochsRan": len(losses),
        "bestEpoch": best_epoch,
        "lastTrainingDate": dates[-1],
        "trainedAt": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "minPrice": min_price,
        "scale": scale,
        "architecture": architecture,
        "validationRmse": round(_rmse(validation_predictions_price, validation_actual_price), 4),
        "trainRmse": round(_rmse(train_predictions_price, train_actual_price), 4),
        "validationDirectionAccuracy": round(validation_direction_accuracy, 4),
        "stateDict": best_state,
    }
    torch.save(artifact, artifact_path)
    metadata_path.write_text(
        json.dumps(
            {
                "ticker": artifact["ticker"],
                "companyName": artifact["companyName"],
                "sector": artifact["sector"],
                "period": artifact["period"],
                "lookbackWindow": artifact["lookbackWindow"],
                "hiddenSize": artifact["hiddenSize"],
                "numLayers": artifact["numLayers"],
                "dropout": artifact["dropout"],
                "learningRate": artifact["learningRate"],
                "batchSize": artifact["batchSize"],
                "epochsRan": artifact["epochsRan"],
                "bestEpoch": artifact["bestEpoch"],
                "lastTrainingDate": artifact["lastTrainingDate"],
                "trainedAt": artifact["trainedAt"],
                "validationRmse": artifact["validationRmse"],
                "trainRmse": artifact["trainRmse"],
                "validationDirectionAccuracy": artifact["validationDirectionAccuracy"],
                "architecture": artifact["architecture"],
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    return artifact


def get_stock_blackbox_prediction(ticker: str) -> dict[str, object]:
    pretrained_prediction = _get_pretrained_stock_prediction(ticker)
    if pretrained_prediction is not None:
        return pretrained_prediction

    period = "6mo"
    dates, prices = _load_stock_history(ticker, period=period)
    if len(prices) < 65:
        raise ValueError("예측에 필요한 최근 주가 이력이 충분하지 않습니다. 다른 종목을 선택해 주세요.")

    normalized_ticker = ticker.upper()
    preset = next((item for item in STOCK_PRESETS if item["ticker"] == normalized_ticker), None)
    company_name = preset["label"] if preset else normalized_ticker
    sector = preset["sector"] if preset else "Market"

    latest_close = float(prices[-1])
    latest_date = dates[-1]
    predicted_date = _future_business_days(latest_date, 1)[0]
    returns = np.diff(prices) / prices[:-1]

    recent_change_pct = ((latest_close / float(prices[-6])) - 1.0) * 100
    monthly_window = prices[-22:]
    monthly_low = float(monthly_window.min())
    monthly_high = float(monthly_window.max())
    volatility_pct = float(np.std(returns[-20:]) * 100)

    short_momentum = (latest_close / float(prices[-6])) - 1.0
    medium_momentum = (latest_close / float(prices[-21])) - 1.0
    long_momentum = (latest_close / float(prices[-61])) - 1.0
    sma5 = float(np.mean(prices[-5:]))
    sma20 = float(np.mean(prices[-20:]))
    sma60 = float(np.mean(prices[-60:]))

    trend_signal = ((sma5 / sma20) - 1.0) * 0.6 + ((sma20 / sma60) - 1.0) * 0.4
    momentum_signal = short_momentum * 0.5 + medium_momentum * 0.35 + long_momentum * 0.15
    mean_reversion_signal = -(((latest_close / sma20) - 1.0) * 0.18)
    raw_return = momentum_signal * 0.55 + trend_signal * 0.35 + mean_reversion_signal * 0.10
    expected_return = float(np.clip(raw_return, -0.065, 0.065))
    predicted_close = latest_close * (1.0 + expected_return)

    direction = "flat"
    if expected_return > 0.003:
        direction = "up"
    elif expected_return < -0.003:
        direction = "down"

    expected_sign = 1 if expected_return > 0 else -1 if expected_return < 0 else 0
    component_signs = [
        1 if momentum_signal > 0 else -1 if momentum_signal < 0 else 0,
        1 if trend_signal > 0 else -1 if trend_signal < 0 else 0,
        1 if mean_reversion_signal > 0 else -1 if mean_reversion_signal < 0 else 0,
    ]
    agreement = sum(1 for sign in component_signs if sign == expected_sign and sign != 0)
    confidence = int(round(np.clip(56 + agreement * 8 + max(0.0, 3.2 - volatility_pct) * 4.5, 52, 91)))

    range_width = max(latest_close * max(volatility_pct / 100.0, 0.008) * 1.35, latest_close * 0.01)
    range_low = predicted_close - range_width
    range_high = predicted_close + range_width

    summary = _stock_summary(direction, predicted_close, expected_return, confidence)
    reasons = _stock_reasons(
        short_momentum=short_momentum,
        medium_momentum=medium_momentum,
        latest_close=latest_close,
        sma20=sma20,
        sma60=sma60,
        volatility_pct=volatility_pct,
    )

    history = [
        {
            "date": dates[index],
            "close": round(float(prices[index]), 2),
        }
        for index in range(max(0, len(dates) - 30), len(dates))
    ]
    forecast = [
        {
            "date": predicted_date,
            "close": round(float(predicted_close), 2),
        }
    ]

    return {
        "ticker": normalized_ticker,
        "companyName": company_name,
        "sector": sector,
        "period": period,
        "modelLabel": "VisAIble Black-Box v1",
        "generatedAt": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "latestDate": latest_date,
        "predictedDate": predicted_date,
        "direction": direction,
        "summary": summary,
        "reasons": reasons,
        "history": history,
        "forecast": forecast,
        "signals": [
            {
                "label": "5일 모멘텀",
                "value": f"{short_momentum * 100:+.2f}%",
                "tone": _signal_tone(short_momentum),
            },
            {
                "label": "20일 추세",
                "value": f"{((sma5 / sma20) - 1.0) * 100:+.2f}%",
                "tone": _signal_tone((sma5 / sma20) - 1.0),
            },
            {
                "label": "변동성",
                "value": f"{volatility_pct:.2f}%",
                "tone": "negative" if volatility_pct >= 3.2 else "neutral",
            },
        ],
        "metrics": {
            "latestClose": round(latest_close, 2),
            "predictedClose": round(float(predicted_close), 2),
            "predictedChangePct": round(expected_return * 100, 2),
            "confidence": confidence,
            "recentChangePct": round(recent_change_pct, 2),
            "monthlyLow": round(monthly_low, 2),
            "monthlyHigh": round(monthly_high, 2),
            "volatilityPct": round(volatility_pct, 2),
            "rangeLow": round(float(range_low), 2),
            "rangeHigh": round(float(range_high), 2),
        },
    }


def train_stock_lstm(payload: StockTrainingRequest) -> dict[str, object]:
    period = "2y"
    dates, prices = _load_stock_history(payload.ticker, period=period)
    sample_count = len(prices) - payload.lookbackWindow
    validation_samples = max(24, payload.forecastDays + 10)

    if sample_count <= validation_samples + 24:
        raise ValueError(
            "주가 이력이 너무 짧아서 LSTM 학습에 필요한 윈도우를 만들 수 없습니다. 다른 종목이나 더 짧은 lookback을 시도해 주세요."
        )

    training_samples = sample_count - validation_samples
    training_prices = prices[: training_samples + payload.lookbackWindow]
    min_price = float(training_prices.min())
    max_price = float(training_prices.max())
    scale = max(max_price - min_price, 1e-6)
    normalized = (prices - min_price) / scale

    windows: list[np.ndarray] = []
    targets: list[float] = []
    target_dates: list[str] = []
    target_prices: list[float] = []

    for index in range(payload.lookbackWindow, len(normalized)):
        windows.append(normalized[index - payload.lookbackWindow:index].astype(np.float32))
        targets.append(float(normalized[index]))
        target_dates.append(dates[index])
        target_prices.append(float(prices[index]))

    train_x = np.stack(windows[:training_samples]).reshape(training_samples, payload.lookbackWindow, 1)
    train_y = np.asarray(targets[:training_samples], dtype=np.float32)
    val_x = np.stack(windows[training_samples:]).reshape(validation_samples, payload.lookbackWindow, 1)
    val_y = np.asarray(targets[training_samples:], dtype=np.float32)
    val_dates = target_dates[training_samples:]
    val_actuals = np.asarray(target_prices[training_samples:], dtype=np.float32)

    train_dataset = TensorDataset(torch.tensor(train_x), torch.tensor(train_y))
    train_loader = DataLoader(
        train_dataset,
        batch_size=min(payload.batchSize, training_samples),
        shuffle=True,
    )

    device = _get_stock_device()
    torch.manual_seed(42)
    model, architecture = _build_stock_model(payload.nodes, payload.hiddenSize)
    model = model.to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=payload.learningRate)
    loss_fn = nn.MSELoss()

    val_x_tensor = torch.tensor(val_x, dtype=torch.float32, device=device)
    val_y_tensor = torch.tensor(val_y, dtype=torch.float32, device=device)
    val_last_input_tensor = val_x_tensor[:, -1, 0]
    losses: list[dict[str, float | int]] = []
    batch_metrics: list[dict[str, float | int]] = []
    batch_step = 0

    for epoch in range(payload.epochs):
        model.train()
        running_loss = 0.0
        running_direction_accuracy = 0.0

        for batch_index, (batch_x, batch_y) in enumerate(train_loader, start=1):
            batch_x = batch_x.to(device)
            batch_y = batch_y.to(device)
            optimizer.zero_grad()
            predictions = model(batch_x).squeeze(-1)
            loss = loss_fn(predictions, batch_y)
            loss.backward()
            optimizer.step()
            running_loss += float(loss.item()) * batch_x.size(0)
            batch_step += 1

            last_input = batch_x[:, -1, 0]
            direction_accuracy = _direction_accuracy(predictions.detach(), batch_y, last_input)
            running_direction_accuracy += direction_accuracy * batch_x.size(0)
            batch_metrics.append(
                {
                    "step": batch_step,
                    "epoch": epoch + 1,
                    "batch": batch_index,
                    "trainLoss": round(float(loss.item()), 6),
                    "directionAccuracy": round(direction_accuracy, 4),
                }
            )

        train_loss = running_loss / training_samples
        train_direction_accuracy = running_direction_accuracy / training_samples

        model.eval()
        with torch.no_grad():
            validation_predictions = model(val_x_tensor).squeeze(-1)
            validation_loss = float(loss_fn(validation_predictions, val_y_tensor).item())
            validation_direction_accuracy = _direction_accuracy(
                validation_predictions,
                val_y_tensor,
                val_last_input_tensor,
            )

        losses.append(
            {
                "epoch": epoch + 1,
                "trainLoss": round(train_loss, 6),
                "validationLoss": round(validation_loss, 6),
                "trainDirectionAccuracy": round(train_direction_accuracy, 4),
                "validationDirectionAccuracy": round(validation_direction_accuracy, 4),
            }
        )

    model.eval()
    with torch.no_grad():
        train_predictions = (
            model(torch.tensor(train_x, dtype=torch.float32, device=device)).squeeze(-1).cpu().numpy()
        )
        validation_predictions = model(val_x_tensor).squeeze(-1).cpu().numpy()

    train_predictions_price = _inverse_scale(train_predictions, min_price, scale)
    train_actual_price = _inverse_scale(train_y, min_price, scale)
    validation_predictions_price = _inverse_scale(validation_predictions, min_price, scale)
    validation_actual_price = _inverse_scale(val_y, min_price, scale)

    forecast_prices = _roll_forward_forecast(
        model=model,
        normalized_history=normalized,
        lookback_window=payload.lookbackWindow,
        forecast_days=payload.forecastDays,
        min_price=min_price,
        scale=scale,
        device=device,
    )
    forecast_dates = _future_business_days(dates[-1], payload.forecastDays)
    selected_preset = next((item for item in STOCK_PRESETS if item["ticker"] == payload.ticker.upper()), None)
    last_close = float(prices[-1])
    forecast_return_pct = ((forecast_prices[-1] - last_close) / last_close) * 100 if last_close else 0.0

    history_window = min(220, len(dates))
    history = [
        {
            "date": dates[index],
            "actual": round(float(prices[index]), 2),
        }
        for index in range(len(dates) - history_window, len(dates))
    ]

    backtest = [
        {
            "date": val_dates[index],
            "actual": round(float(val_actuals[index]), 2),
            "predicted": round(float(validation_predictions_price[index]), 2),
        }
        for index in range(len(val_dates))
    ]

    forecast = [
        {
            "date": forecast_dates[index],
            "predicted": round(float(forecast_prices[index]), 2),
        }
        for index in range(len(forecast_dates))
    ]

    return {
        "ticker": payload.ticker.upper(),
        "companyName": selected_preset["label"] if selected_preset else payload.ticker.upper(),
        "sector": selected_preset["sector"] if selected_preset else "Market Data",
        "period": period,
        "lookbackWindow": payload.lookbackWindow,
        "forecastDays": payload.forecastDays,
        "batchSize": payload.batchSize,
        "trainingSamples": training_samples,
        "validationSamples": validation_samples,
        "architecture": architecture,
        "losses": losses,
        "batchMetrics": batch_metrics,
        "history": history,
        "backtest": backtest,
        "forecast": forecast,
        "metrics": {
            "trainRmse": round(_rmse(train_predictions_price, train_actual_price), 4),
            "validationRmse": round(_rmse(validation_predictions_price, validation_actual_price), 4),
            "lastClose": round(last_close, 2),
            "forecastReturnPct": round(float(forecast_return_pct), 2),
        },
    }


def _build_stock_model(
    nodes: list[StockNodePayload],
    fallback_hidden_size: int,
) -> tuple[StockLSTM, list[str]]:
    resolved_nodes = nodes or [
        StockNodePayload(
            id="stock-lstm-default",
            type="lstm",
            title="LSTM Layer",
            fields=[
                {"label": "Input Size", "value": "1"},
                {"label": "Hidden Size", "value": str(fallback_hidden_size)},
                {"label": "Num Layers", "value": "1"},
            ],
            activation="None",
        ),
        StockNodePayload(
            id="stock-dropout-default",
            type="dropout",
            title="Dropout Layer",
            fields=[{"label": "Probability", "value": "0.15"}],
            activation="None",
        ),
        StockNodePayload(
            id="stock-linear-default",
            type="linear",
            title="Linear Layer",
            fields=[
                {"label": "Input", "value": str(fallback_hidden_size)},
                {"label": "Output", "value": "1"},
            ],
            activation="None",
        ),
    ]

    current_sequence_size = 1
    current_head_size: int | None = None
    seen_dense_head = False
    lstm_layers: list[dict[str, int]] = []
    head_layers: list[nn.Module] = []
    architecture: list[str] = []

    for node in resolved_nodes:
        node_type = node.type.lower()
        if node_type == "lstm":
            if seen_dense_head:
                raise ValueError("LSTM 블럭은 Dense Head 이전에만 둘 수 있습니다.")

            expected_input = current_sequence_size
            input_size = _field_int(node, "Input Size", expected_input)
            hidden_size = _field_int(node, "Hidden Size", fallback_hidden_size)
            num_layers = _field_int(node, "Num Layers", 1)

            if input_size != expected_input:
                raise ValueError(f"{node.title}의 Input Size는 이전 출력 차원인 {expected_input}과 맞아야 합니다.")
            if hidden_size <= 0 or num_layers <= 0:
                raise ValueError("LSTM Hidden Size와 Num Layers는 1 이상이어야 합니다.")

            lstm_layers.append(
                {
                    "input_size": input_size,
                    "hidden_size": hidden_size,
                    "num_layers": num_layers,
                }
            )
            current_sequence_size = hidden_size
            current_head_size = hidden_size
            architecture.append(f"LSTM({input_size}->{hidden_size}, layers={num_layers})")
            continue

        if node_type == "dropout":
            probability = _field_float(node, "Probability", 0.15)
            if not 0 <= probability < 1:
                raise ValueError("Dropout Probability는 0 이상 1 미만이어야 합니다.")
            head_layers.append(nn.Dropout(p=probability))
            seen_dense_head = True
            current_head_size = current_head_size or current_sequence_size
            architecture.append(f"Dropout(p={probability:.2f})")
            continue

        if node_type == "linear":
            seen_dense_head = True
            expected_input = current_head_size or current_sequence_size
            input_size = _field_int(node, "Input", expected_input)
            output_size = _field_int(node, "Output", 1)
            if input_size != expected_input:
                raise ValueError(f"{node.title}의 Input은 이전 출력 차원인 {expected_input}과 맞아야 합니다.")
            if output_size <= 0:
                raise ValueError("Linear Output은 1 이상이어야 합니다.")

            head_layers.append(nn.Linear(input_size, output_size))
            current_head_size = output_size
            architecture.append(f"Linear({input_size}->{output_size})")

            activation_layer = _activation_layer(node.activation)
            if activation_layer is not None:
                head_layers.append(activation_layer)
                architecture.append(node.activation)
            continue

        raise ValueError(f"지원하지 않는 Playground 블럭 타입입니다: {node.type}")

    if not lstm_layers:
        raise ValueError("주식 Playground는 최소 1개의 LSTM 블럭이 필요합니다.")

    final_output_size = current_head_size or current_sequence_size
    if not head_layers:
        head_layers.append(nn.Linear(final_output_size, 1))
        architecture.append(f"Linear({final_output_size}->1)")
        final_output_size = 1

    if final_output_size != 1:
        raise ValueError("마지막 Linear 블럭의 Output은 1이어야 다음 거래일 종가를 예측할 수 있습니다.")

    return StockLSTM(lstm_layers=lstm_layers, head_layers=head_layers), architecture


def _build_default_stock_model(
    *,
    hidden_size: int,
    num_layers: int,
    dropout: float,
) -> tuple[StockLSTM, list[str]]:
    model = StockLSTM(
        lstm_layers=[
            {
                "input_size": 1,
                "hidden_size": hidden_size,
                "num_layers": num_layers,
            }
        ],
        head_layers=[
            nn.Dropout(p=dropout),
            nn.Linear(hidden_size, 1),
        ],
    )
    architecture = [
        f"LSTM(1->{hidden_size}, layers={num_layers})",
        f"Dropout(p={dropout:.2f})",
        f"Linear({hidden_size}->1)",
    ]
    return model, architecture


def _get_pretrained_stock_prediction(ticker: str) -> dict[str, object] | None:
    artifact_path = STOCK_MODEL_DIR / f"{ticker.lower()}.pt"
    if not artifact_path.exists():
        return None

    artifact = torch.load(artifact_path, map_location="cpu", weights_only=False)
    normalized_ticker = str(artifact["ticker"]).upper()
    period = str(artifact.get("period") or "2y")
    dates, prices = _load_stock_history(normalized_ticker, period=period)
    lookback_window = int(artifact["lookbackWindow"])
    if len(prices) < lookback_window + 5:
        return None

    min_price = float(artifact["minPrice"])
    scale = max(float(artifact["scale"]), 1e-6)
    hidden_size = int(artifact["hiddenSize"])
    num_layers = int(artifact["numLayers"])
    dropout = float(artifact["dropout"])
    model, architecture = _build_default_stock_model(
        hidden_size=hidden_size,
        num_layers=num_layers,
        dropout=dropout,
    )
    state_dict = artifact["stateDict"]
    model.load_state_dict(state_dict)
    device = _get_stock_device()
    model = model.to(device)
    model.eval()

    rolling_window = ((prices[-lookback_window:] - min_price) / scale).astype(np.float32)
    with torch.no_grad():
        input_tensor = torch.tensor(rolling_window.reshape(1, lookback_window, 1), dtype=torch.float32, device=device)
        predicted_value = float(model(input_tensor).squeeze().item())

    predicted_close = predicted_value * scale + min_price
    latest_close = float(prices[-1])
    latest_date = dates[-1]
    predicted_date = _future_business_days(latest_date, 1)[0]
    returns = np.diff(prices) / prices[:-1]
    recent_change_pct = ((latest_close / float(prices[-6])) - 1.0) * 100
    monthly_window = prices[-22:]
    monthly_low = float(monthly_window.min())
    monthly_high = float(monthly_window.max())
    volatility_pct = float(np.std(returns[-20:]) * 100)
    predicted_change_pct = ((predicted_close / latest_close) - 1.0) * 100 if latest_close else 0.0

    direction = "flat"
    if predicted_change_pct > 0.3:
        direction = "up"
    elif predicted_change_pct < -0.3:
        direction = "down"

    val_rmse = float(artifact.get("validationRmse") or 0.0)
    val_direction_accuracy = float(artifact.get("validationDirectionAccuracy") or 0.5)
    confidence = int(
        round(
            np.clip(
                58 + val_direction_accuracy * 28 + max(0.0, 4.0 - volatility_pct) * 3.5 - min(val_rmse / max(latest_close, 1.0), 0.08) * 120,
                54,
                93,
            )
        )
    )
    range_width = max(val_rmse * 1.15, latest_close * max(volatility_pct / 100.0, 0.008))
    range_low = predicted_close - range_width
    range_high = predicted_close + range_width
    summary = _pretrained_stock_summary(
        direction=direction,
        predicted_close=predicted_close,
        predicted_change_pct=predicted_change_pct,
        confidence=confidence,
        val_direction_accuracy=val_direction_accuracy,
    )
    reasons = [
        f"미리 학습된 LSTM은 최근 {lookback_window}거래일 시퀀스를 읽고 다음 거래일 종가를 예측했습니다.",
        f"저장된 모델의 검증 RMSE는 {val_rmse:.2f}, 방향성 정확도는 {val_direction_accuracy * 100:.1f}%입니다.",
        f"최근 20거래일 변동성은 {volatility_pct:.2f}%로 계산되어 예측 범위를 {range_low:.2f} ~ {range_high:.2f}달러로 잡았습니다.",
    ]

    return {
        "ticker": normalized_ticker,
        "companyName": str(artifact.get("companyName") or normalized_ticker),
        "sector": str(artifact.get("sector") or "Market"),
        "period": period,
        "modelLabel": "Pretrained LSTM v1",
        "generatedAt": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "latestDate": latest_date,
        "predictedDate": predicted_date,
        "direction": direction,
        "summary": summary,
        "reasons": reasons,
        "history": [
            {
                "date": dates[index],
                "close": round(float(prices[index]), 2),
            }
            for index in range(max(0, len(dates) - 30), len(dates))
        ],
        "forecast": [
            {
                "date": predicted_date,
                "close": round(float(predicted_close), 2),
            }
        ],
        "signals": [
            {
                "label": "예측 변화율",
                "value": f"{predicted_change_pct:+.2f}%",
                "tone": _signal_tone(predicted_change_pct),
            },
            {
                "label": "검증 방향성",
                "value": f"{val_direction_accuracy * 100:.1f}%",
                "tone": "positive" if val_direction_accuracy >= 0.55 else "neutral",
            },
            {
                "label": "변동성",
                "value": f"{volatility_pct:.2f}%",
                "tone": "negative" if volatility_pct >= 3.2 else "neutral",
            },
        ],
        "metrics": {
            "latestClose": round(latest_close, 2),
            "predictedClose": round(float(predicted_close), 2),
            "predictedChangePct": round(float(predicted_change_pct), 2),
            "confidence": confidence,
            "recentChangePct": round(recent_change_pct, 2),
            "monthlyLow": round(monthly_low, 2),
            "monthlyHigh": round(monthly_high, 2),
            "volatilityPct": round(volatility_pct, 2),
            "rangeLow": round(float(range_low), 2),
            "rangeHigh": round(float(range_high), 2),
        },
    }


def _load_yfinance():
    try:
        return import_module("yfinance")
    except ImportError as error:
        raise ValueError(
            "주식 Playground를 사용하려면 backend 환경에 `yfinance`가 설치되어 있어야 합니다. `pip install -r backend/requirements.txt` 후 다시 시도해 주세요."
        ) from error


def _get_stock_device() -> torch.device:
    mps_backend = getattr(torch.backends, "mps", None)
    if mps_backend and mps_backend.is_available():
        return torch.device("mps")
    if torch.cuda.is_available():
        return torch.device("cuda")
    return torch.device("cpu")


def _load_stock_history(ticker: str, period: str) -> tuple[list[str], np.ndarray]:
    normalized_ticker = ticker.upper()
    cache_key = (normalized_ticker, period)
    cached = STOCK_HISTORY_CACHE.get(cache_key)
    if cached is not None:
        cached_at, cached_dates, cached_prices = cached
        if datetime.utcnow() - cached_at <= STOCK_HISTORY_CACHE_TTL:
            return list(cached_dates), cached_prices.copy()

    try:
        response = requests.get(
            f"https://query1.finance.yahoo.com/v8/finance/chart/{normalized_ticker}",
            params={
                "range": period,
                "interval": "1d",
                "includePrePost": "false",
                "events": "div,splits",
            },
            timeout=20,
            headers={
                "User-Agent": "Mozilla/5.0 VisAIble Playground",
            },
        )
        response.raise_for_status()
        payload = response.json()
        result = ((payload.get("chart") or {}).get("result") or [None])[0]
        timestamps = result.get("timestamp") if isinstance(result, dict) else None
        closes = ((((result or {}).get("indicators") or {}).get("quote") or [{}])[0]).get("close")
        if not timestamps or not closes:
            raise ValueError("chart payload empty")

        pairs = [
            (datetime.utcfromtimestamp(int(timestamp)).strftime("%Y-%m-%d"), float(close))
            for timestamp, close in zip(timestamps, closes)
            if close is not None
        ]
        if not pairs:
            raise ValueError("close values empty")

        dates = [date for date, _ in pairs]
        prices = np.asarray([price for _, price in pairs], dtype=np.float32)
    except Exception:
        yf = _load_yfinance()
        try:
            history = yf.Ticker(normalized_ticker).history(period=period, interval="1d", auto_adjust=False)
        except Exception as error:
            raise ValueError(f"{normalized_ticker} 데이터를 가져오지 못했습니다: {error}") from error

        if history is None or history.empty or "Close" not in history:
            raise ValueError(f"{normalized_ticker} 주가 데이터를 찾지 못했습니다. 다른 티커를 선택해 주세요.")

        close_series = history["Close"].dropna()
        if close_series.empty:
            raise ValueError(f"{normalized_ticker} 종가 데이터가 비어 있습니다.")

        dates = [index.strftime("%Y-%m-%d") for index in close_series.index.to_pydatetime()]
        prices = close_series.to_numpy(dtype=np.float32)

    STOCK_HISTORY_CACHE[cache_key] = (datetime.utcnow(), dates, prices.copy())
    return dates, prices


def _inverse_scale(values: np.ndarray, min_price: float, scale: float) -> np.ndarray:
    return values * scale + min_price


def _rmse(predictions: np.ndarray, actuals: np.ndarray) -> float:
    return float(sqrt(np.mean((predictions - actuals) ** 2)))


def _field_value(node: StockNodePayload, label: str, fallback: str) -> str:
    return next((field.value for field in node.fields if field.label == label), fallback)


def _field_int(node: StockNodePayload, label: str, fallback: int) -> int:
    try:
        return int(float(_field_value(node, label, str(fallback))))
    except ValueError as error:
        raise ValueError(f"{node.title}의 {label} 값을 숫자로 입력해 주세요.") from error


def _field_float(node: StockNodePayload, label: str, fallback: float) -> float:
    try:
        return float(_field_value(node, label, str(fallback)))
    except ValueError as error:
        raise ValueError(f"{node.title}의 {label} 값을 숫자로 입력해 주세요.") from error


def _activation_layer(name: str) -> nn.Module | None:
    normalized = name.strip().lower()
    if normalized in {"", "none"}:
        return None
    if normalized == "relu":
        return nn.ReLU()
    if normalized == "tanh":
        return nn.Tanh()
    if normalized == "sigmoid":
        return nn.Sigmoid()
    if normalized == "gelu":
        return nn.GELU()
    raise ValueError(f"지원하지 않는 활성화 함수입니다: {name}")


def _direction_accuracy(
    predictions: torch.Tensor,
    targets: torch.Tensor,
    last_input: torch.Tensor,
) -> float:
    predicted_direction = predictions - last_input
    target_direction = targets - last_input
    correct = ((predicted_direction >= 0) == (target_direction >= 0)).float().mean()
    return float(correct.item())


def _roll_forward_forecast(
    model: StockLSTM,
    normalized_history: np.ndarray,
    lookback_window: int,
    forecast_days: int,
    min_price: float,
    scale: float,
    device: torch.device,
) -> list[float]:
    rolling_window = normalized_history[-lookback_window:].astype(np.float32).copy()
    forecast_values: list[float] = []

    for _ in range(forecast_days):
        input_tensor = torch.tensor(rolling_window.reshape(1, lookback_window, 1), dtype=torch.float32, device=device)
        with torch.no_grad():
            next_value = float(model(input_tensor).squeeze().item())
        rolling_window = np.concatenate([rolling_window[1:], np.asarray([next_value], dtype=np.float32)])
        forecast_values.append(float(next_value * scale + min_price))

    return forecast_values


def _future_business_days(last_date: str, count: int) -> list[str]:
    cursor = datetime.fromisoformat(last_date)
    dates: list[str] = []

    while len(dates) < count:
        cursor += timedelta(days=1)
        if cursor.weekday() >= 5:
            continue
        dates.append(cursor.strftime("%Y-%m-%d"))

    return dates


def _signal_tone(value: float) -> str:
    if value > 0:
        return "positive"
    if value < 0:
        return "negative"
    return "neutral"


def _pretrained_stock_summary(
    *,
    direction: str,
    predicted_close: float,
    predicted_change_pct: float,
    confidence: int,
    val_direction_accuracy: float,
) -> str:
    if direction == "up":
        return (
            f"미리 학습된 LSTM 모델은 다음 거래일 종가를 {predicted_close:.2f}달러로 예측했습니다. "
            f"예상 변화율은 {predicted_change_pct:+.2f}%이고, 검증 방향성 정확도는 {val_direction_accuracy * 100:.1f}%, "
            f"현재 신뢰도는 {confidence}%입니다."
        )
    if direction == "down":
        return (
            f"미리 학습된 LSTM 모델은 단기 조정을 반영해 다음 거래일 종가를 {predicted_close:.2f}달러로 예측했습니다. "
            f"예상 변화율은 {predicted_change_pct:+.2f}%이고, 검증 방향성 정확도는 {val_direction_accuracy * 100:.1f}%, "
            f"현재 신뢰도는 {confidence}%입니다."
        )
    return (
        f"미리 학습된 LSTM 모델은 방향성이 크지 않다고 보고 다음 거래일 종가를 {predicted_close:.2f}달러 근처로 예측했습니다. "
        f"예상 변화율은 {predicted_change_pct:+.2f}%이고, 검증 방향성 정확도는 {val_direction_accuracy * 100:.1f}%, "
        f"현재 신뢰도는 {confidence}%입니다."
    )


def _stock_summary(direction: str, predicted_close: float, expected_return: float, confidence: int) -> str:
    if direction == "up":
        return (
            f"블랙박스 모델은 최근 모멘텀과 추세가 아직 살아 있다고 보고, "
            f"다음 거래일 종가를 {predicted_close:.2f}달러로 예측했습니다. "
            f"예상 수익률은 {expected_return * 100:+.2f}%이고 신뢰도는 {confidence}%입니다."
        )
    if direction == "down":
        return (
            f"블랙박스 모델은 단기 탄력이 둔화되고 있다고 보고, "
            f"다음 거래일 종가를 {predicted_close:.2f}달러로 예측했습니다. "
            f"예상 수익률은 {expected_return * 100:+.2f}%이고 신뢰도는 {confidence}%입니다."
        )
    return (
        f"블랙박스 모델은 방향성이 크지 않다고 보고, "
        f"다음 거래일 종가를 {predicted_close:.2f}달러 근처로 예측했습니다. "
        f"예상 변동폭은 {expected_return * 100:+.2f}%이고 신뢰도는 {confidence}%입니다."
    )


def _stock_reasons(
    *,
    short_momentum: float,
    medium_momentum: float,
    latest_close: float,
    sma20: float,
    sma60: float,
    volatility_pct: float,
) -> list[str]:
    relative_to_sma20 = ((latest_close / sma20) - 1.0) * 100
    trend_vs_sma60 = ((sma20 / sma60) - 1.0) * 100

    momentum_line = (
        f"최근 5일 수익률은 {short_momentum * 100:+.2f}%, 20일 수익률은 {medium_momentum * 100:+.2f}%로 "
        f"단기 모멘텀 흐름을 같이 반영했습니다."
    )
    trend_line = (
        f"현재 가격은 20일 평균 대비 {relative_to_sma20:+.2f}% 위치에 있고, "
        f"20일 평균은 60일 평균 대비 {trend_vs_sma60:+.2f}% 수준이라 추세 방향을 같이 읽었습니다."
    )
    volatility_line = (
        f"최근 20거래일 변동성은 {volatility_pct:.2f}%로 계산되어, "
        f"변동성이 큰 종목일수록 예측 범위를 더 넓게 잡습니다."
    )
    return [momentum_line, trend_line, volatility_line]
