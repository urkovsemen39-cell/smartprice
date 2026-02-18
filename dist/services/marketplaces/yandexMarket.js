"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.YandexMarketAdapter = void 0;
const logger_1 = __importDefault(require("../../utils/logger"));
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
            logger_1.default.error(`${this.name} error:`, error);
            return [];
        }
    }
    async isAvailable() {
        return !!this.apiKey;
    }
}
exports.YandexMarketAdapter = YandexMarketAdapter;
