"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.YandexMarketAdapter = void 0;
class YandexMarketAdapter {
    constructor() {
        this.name = 'Яндекс.Маркет';
        this.baseUrl = 'https://api.partner.market.yandex.ru/v2';
        this.apiKey = process.env.YANDEX_MARKET_API_KEY || '';
    }
    async search(query, filters) {
        // TODO: Реальная интеграция с Яндекс.Маркет API
        // Пока возвращаем пустой массив, так как нужен API ключ
        if (!this.apiKey) {
            return [];
        }
        try {
            // Здесь будет реальный запрос к API
            // const response = await fetch(`${this.baseUrl}/models.json?text=${query}`, {
            //   headers: { 'Authorization': `OAuth ${this.apiKey}` }
            // });
            return [];
        }
        catch (error) {
            console.error(`❌ ${this.name} error:`, error);
            return [];
        }
    }
    async isAvailable() {
        return !!this.apiKey;
    }
}
exports.YandexMarketAdapter = YandexMarketAdapter;
