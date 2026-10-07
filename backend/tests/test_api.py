"""API-level checks for the single-user trading workflow."""

from fastapi.testclient import TestClient

from app import main
from app.database import TradingDatabase


def test_portfolio_trade_watchlist_and_mock_chat(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "database", TradingDatabase(tmp_path / "finally.db"))
    monkeypatch.setenv("LLM_MOCK", "true")

    with TestClient(main.app) as client:
        assert client.get("/api/health").json() == {"status": "ok"}

        portfolio = client.get("/api/portfolio").json()
        assert portfolio["cash_balance"] == 10000.0
        assert portfolio["positions"] == []
        assert len(client.get("/api/watchlist").json()) == 10
        assert client.get("/api/portfolio/history").json()

        purchased = client.post(
            "/api/portfolio/trade",
            json={"ticker": "aapl", "side": "buy", "quantity": 2},
        )
        assert purchased.status_code == 200
        assert 180.0 < purchased.json()["price"] < 200.0
        assert purchased.json()["portfolio"]["cash_balance"] == round(
            10000.0 - purchased.json()["price"] * 2, 2
        )

        rejected = client.post(
            "/api/portfolio/trade",
            json={"ticker": "AAPL", "side": "sell", "quantity": 3},
        )
        assert rejected.status_code == 400
        assert rejected.json()["detail"] == "Insufficient shares for this trade."

        response = client.post("/api/chat", json={"message": "How is my portfolio doing?"})
        assert response.status_code == 200
        assert "How is my portfolio doing?" in response.json()["message"]
        assert response.json()["actions"] == []
        assert [message["role"] for message in client.get("/api/chat/history").json()] == [
            "user",
            "assistant",
        ]


def test_trade_rejects_unknown_price_and_non_finite_quantity(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "database", TradingDatabase(tmp_path / "finally.db"))

    with TestClient(main.app) as client:
        unknown = client.post(
            "/api/portfolio/trade",
            json={"ticker": "UNKNOWN", "side": "buy", "quantity": 1},
        )
        assert unknown.status_code == 400
        assert "No current market price" in unknown.json()["detail"]

        non_finite = client.post(
            "/api/portfolio/trade",
            json={"ticker": "AAPL", "side": "buy", "quantity": "Infinity"},
        )
        assert non_finite.status_code == 422
