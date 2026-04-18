import fetch from "node-fetch";



export async function watchAddress(address) {

const res = await fetch(`https://mempool.space/api/address/${bc1qpqlsehzrjmxhutxmlwt6tdjkwafvcgugpv5375}`);

const data = await res.json();



return {

balance: data.chain_stats.funded_txo_sum,

tx_count: data.chain_stats.tx_count

};

}