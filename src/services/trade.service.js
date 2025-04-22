/* eslint-disable prettier/prettier */
const tradeHistory = [];
function calculateSimulatedPrice(basePrice, slippage) {
  const slippageFactor = 1 + (slippage / 100);
  return basePrice * slippageFactor;
}
class TradeService {
  static simulateTrade(params) {
    const trade = {
      ...params,
      timestamp: new Date().toISOString(),
      status: 'executed',
      simulatedPrice: calculateSimulatedPrice(params.price, params.slippage)
    };
    
    tradeHistory.push(trade);
    return trade;
  }

  static getTradeHistory() {
    return tradeHistory;
  }
}


module.exports = TradeService;
