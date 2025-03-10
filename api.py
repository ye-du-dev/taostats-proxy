import os
import time
import asyncio
from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from cachetools import TTLCache
import bittensor as bt
import httpx
from typing import Annotated, Dict, List, Optional, Generator, AsyncGenerator

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize subtensor
    subtensor = bt.AsyncSubtensor(network="finney")
    await subtensor.initialize()
    app.state.subtensor = subtensor

    # Start background task
    price_task = asyncio.create_task(price_refresh_loop())
    
    yield
    
    # Cleanup
    price_task.cancel()
    try:
        await price_task
    except asyncio.CancelledError:
        pass
    
    # Close subtensor connection
    await app.state.subtensor.close()

app = FastAPI(lifespan=lifespan)

# API Configuration
API_CONFIG = {
    "baseUrl": "https://pro-api.coinmarketcap.com",
    "headers": {
        "X-CMC_PRO_API_KEY": os.environ["CMC_PRO_API_KEY"],
        "accept": "application/json"
    }
}

RAO = 10**9

# Cache settings
cache: Dict[int, TTLCache] = {}  # Dictionary to store TTLCache per netuid
global_price_cache = TTLCache(maxsize=1, ttl=120)  # Separate cache for price

def get_cache(netuid: int) -> TTLCache:
    """Get or create a cache for the specified netuid."""
    if netuid not in cache:
        cache[netuid] = TTLCache(maxsize=100, ttl=120)
    return cache[netuid]

def get_subtensor(request: Request) -> bt.AsyncSubtensor:
    """Get the subtensor instance from app state."""
    return request.app.state.subtensor

async def fetch_all_neurons(subtensor: bt.AsyncSubtensor, netuid: int = 16) -> Dict:
    """Fetch neuron list using Bittensor SDK."""
    try:
        # Get metagraph for the specified netuid
        info = await subtensor.get_metagraph_info(netuid)
        
        # Format neuron data to match expected output
        neurons_data = []

        for i in range(info.num_uids):
            neuron = {
                "uid": i,
                "daily_reward": int(info.emission[i].rao * 20),
                "alpha_stake": int(info.alpha_stake[i].rao),
                "stake": float(info.total_stake[i].rao),
                "coldkey": str(info.coldkeys[i]),
                "hotkey": str(info.hotkeys[i])
            }
            neurons_data.append(neuron)
            
        return {"data": neurons_data}
    except Exception as e:
        print(f"Error fetching neurons: {e}")
        return {"data": []}

async def fetch_price() -> Dict:
    """Fetch TAO price from CoinMarketCap API."""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{API_CONFIG['baseUrl']}/v1/cryptocurrency/quotes/latest",
                headers=API_CONFIG["headers"],
                params={"symbol": "TAO"},
                timeout=10.0
            )
            response.raise_for_status()
            
            data = response.json()
            quote_data = data["data"]["TAO"]["quote"]["USD"]
            
            return {
                "data": [{
                    "price": quote_data["price"],
                    "market_cap": quote_data["market_cap"],
                    "circulating_supply": data["data"]["TAO"]["circulating_supply"]
                }]
            }
    except Exception as e:
        print(f"Error fetching price from CMC: {e}")
        return {"data": [{"price": 0.0}]}

async def fetch_pool_data(subtensor: bt.AsyncSubtensor, netuid: int = 16) -> Dict:
    """Calculate Alpha/TAO pool data using Bittensor SDK."""
    try:
        # Calculate total stake and rewards
        subnet = await subtensor.subnet(netuid)
        
        # Calculate price (simplified)
        price = subnet.price.tao
        
        return {"data": [{"price": price}]}
    except Exception as e:
        print(f"Error fetching pool data: {e}")
        return {"data": [{"price": 0.0}]}

@app.get("/api/metagraph/latest/v1")
async def neurons_proxy(
    subtensor: Annotated[bt.AsyncSubtensor, Depends(get_subtensor)],
    netuid: int = 16
):
    """Return neuron list from cache, fetch if missing."""
    netuid_cache = get_cache(netuid)
    
    if "neurons" not in netuid_cache:
        netuid_cache["neurons"] = await fetch_all_neurons(subtensor, netuid)

    return netuid_cache["neurons"]

@app.get("/api/price/latest/v1")
async def price_proxy():
    """Return price from cache if available, otherwise fetch a new price."""
    if "price" not in global_price_cache:
        global_price_cache["price"] = await fetch_price()
    
    return global_price_cache["price"]

@app.get("/api/dtao/pool/v1")
async def pool_proxy(
    subtensor: Annotated[bt.AsyncSubtensor, Depends(get_subtensor)],
    netuid: int = 16
):
    """Return pool data from cache, fetch if missing."""
    netuid_cache = get_cache(netuid)
    
    if "pool_data" not in netuid_cache:
        netuid_cache["pool_data"] = await fetch_pool_data(subtensor, netuid)

    return netuid_cache["pool_data"]

async def price_refresh_loop():
    """Background task to refresh price every 60 seconds."""
    while True:
        global_price_cache["price"] = await fetch_price()
        await asyncio.sleep(60)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 