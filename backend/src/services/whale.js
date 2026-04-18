import fetch from "node-fetch";



export async function getWhaleSignal() {

const res = await fetch("https://mempool.space/api/v1/fees/recommended");

const data = await res.json();



// Simple heuristic (expand later)

return {

congestion: data.fastestFee > 50,

sentiment: data.fastestFee > 50 ? "BULLISH" : "NEUTRAL"

};

}

