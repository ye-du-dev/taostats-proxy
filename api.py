import os
import time
import threading
from flask import Flask, jsonify, request
from cachetools import TTLCache
import bittensor as bt
import requests

app = Flask(__name__)

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
cache = {}  # Dictionary to store TTLCache per netuid
cache_lock = threading.Lock()  # Lock to prevent simultaneous cache access
global_price_cache = TTLCache(maxsize=1, ttl=120)  # Separate cache for price

def get_cache(netuid):
    """Get or create a cache for the specified netuid."""
    with cache_lock:
        if netuid not in cache:
            cache[netuid] = TTLCache(maxsize=100, ttl=120)
        return cache[netuid]

def fetch_all_neurons(netuid=16):
    """Fetch neuron list using Bittensor SDK."""
    try:
        # Initialize subtensor connection
        subtensor = bt.subtensor(network="finney")
        
        # Get metagraph for the specified netuid
        metagraph = bt.metagraph(netuid=netuid, subtensor=subtensor)
        
        # Format neuron data to match expected output
        neurons_data = []

        for i in range(len(metagraph.neurons)):
            neuron = {
                "uid": int(metagraph.uids[i]),
                "daily_reward": int(metagraph.emission[i] * 20 * RAO),
                "alpha_stake": int(metagraph.S[i] * RAO),
                "stake": float(metagraph.total_stake[i] * RAO),
                "coldkey": str(metagraph.coldkeys[i]),
                "hotkey": str(metagraph.hotkeys[i])
            }
            neurons_data.append(neuron)
            
        return {"data": neurons_data}
    except Exception as e:
        print(f"Error fetching neurons: {e}")
        return {"data": []}

def fetch_price():
    """Fetch TAO price from CoinMarketCap API."""
    try:
        url = f"{API_CONFIG['baseUrl']}/v1/cryptocurrency/quotes/latest"
        params = {"symbol": "TAO"}
        
        response = requests.get(
            url, 
            headers=API_CONFIG["headers"], 
            params=params,
            timeout=10
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

def fetch_pool_data(netuid=16):
    """Calculate Alpha/TAO pool data using Bittensor SDK."""
    try:
        subtensor = bt.subtensor(network="finney")
        
        # Calculate total stake and rewards
        subnets = subtensor.all_subnets()
        
        # Calculate price (simplified)
        price = subnets[netuid].price.tao
        
        return {"data": [{"price": price}]}
    except Exception as e:
        print(f"Error fetching pool data: {e}")
        return {"data": [{"price": 0.0}]}

@app.route("/api/metagraph/latest/v1", methods=["GET"])
def neurons_proxy():
    """Return neuron list from cache, fetch if missing."""
    netuid = request.args.get("netuid", default=16, type=int)
    netuid_cache = get_cache(netuid)

    with cache_lock:
        if "neurons" not in netuid_cache:
            netuid_cache["neurons"] = fetch_all_neurons(netuid)

    return jsonify(netuid_cache["neurons"])

@app.route("/api/price/latest/v1", methods=["GET"])
def price_proxy():
    """Return price from cache if available, otherwise fetch a new price."""
    with cache_lock:
        if "price" not in global_price_cache:
            global_price_cache["price"] = fetch_price()
    
    return jsonify(global_price_cache["price"])

@app.route("/api/dtao/pool/v1", methods=["GET"])
def pool_proxy():
    """Return pool data from cache, fetch if missing."""
    netuid = request.args.get("netuid", default=16, type=int)
    netuid_cache = get_cache(netuid)

    with cache_lock:
        if "pool_data" not in netuid_cache:
            netuid_cache["pool_data"] = fetch_pool_data(netuid)

    return jsonify(netuid_cache["pool_data"])

@app.route("/force-refresh", methods=["POST"])
def force_refresh():
    """Manually refresh the cache for a given netuid."""
    netuid = request.args.get("netuid", default=16, type=int)
    netuid_cache = get_cache(netuid)

    with cache_lock:
        netuid_cache["neurons"] = fetch_all_neurons(netuid)
        netuid_cache["pool_data"] = fetch_pool_data(netuid)
        global_price_cache["price"] = fetch_price()

    return jsonify({"message": f"Cache refreshed for netuid {netuid}"})

@app.route("/cache-status", methods=["GET"])
def cache_status():
    """Check cache status for a given netuid."""
    netuid = request.args.get("netuid", default=16, type=int)
    netuid_cache = cache.get(netuid, {})

    with cache_lock:
        return jsonify({
            "neurons_cached": "neurons" in netuid_cache,
            "price_cached": "price" in global_price_cache,
            "pool_data_cached": "pool_data" in netuid_cache,
        })

def price_refresh_loop():
    """Background thread to refresh price every 60 seconds."""
    while True:
        with cache_lock:
            global_price_cache["price"] = fetch_price()
        time.sleep(60)

if __name__ == "__main__":
    # Start background price refresher thread
    threading.Thread(target=price_refresh_loop, daemon=True).start()
    app.run(host="0.0.0.0", port=8000) 