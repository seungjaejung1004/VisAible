from fastapi import APIRouter, HTTPException

from app.schemas.stocks import (
    StockPresetResponse,
    StockPredictionResponse,
    StockSearchResponse,
    StockTrainingRequest,
    StockTrainingResponse,
)
from app.services.stocks import (
    get_stock_blackbox_prediction,
    list_stock_presets,
    search_stocks,
    train_stock_lstm,
)


router = APIRouter(tags=["stocks"])


@router.get("/stocks/presets", response_model=list[StockPresetResponse])
def get_stock_presets() -> list[StockPresetResponse]:
    return [StockPresetResponse(**item) for item in list_stock_presets()]


@router.get("/stocks/search", response_model=list[StockSearchResponse])
def find_stocks(query: str) -> list[StockSearchResponse]:
    return [StockSearchResponse(**item) for item in search_stocks(query)]


@router.get("/stocks/predict/{ticker}", response_model=StockPredictionResponse)
def get_stock_prediction(ticker: str) -> StockPredictionResponse:
    try:
        result = get_stock_blackbox_prediction(ticker)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    return StockPredictionResponse(**result)


@router.post("/stocks/train", response_model=StockTrainingResponse)
def run_stock_training(payload: StockTrainingRequest) -> StockTrainingResponse:
    try:
        result = train_stock_lstm(payload)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    return StockTrainingResponse(**result)
