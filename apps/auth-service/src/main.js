"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const helmet_1 = __importDefault(require("helmet"));
const app_module_1 = require("./app.module");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    const logger = new common_1.Logger('AuthService');
    app.use((0, helmet_1.default)());
    app.enableCors({
        origin: (origin, callback) => {
            // Allow requests from *.shoposphere.in subdomains + localhost in dev
            const allowed = /^https?:\/\/(.*\.shoposphere\.in|localhost)(:\d+)?$/;
            if (!origin || allowed.test(origin)) {
                callback(null, true);
            }
            else {
                callback(new Error('Not allowed by CORS'));
            }
        },
        credentials: true,
    });
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
    }));
    app.setGlobalPrefix('v1');
    const port = process.env.PORT ?? 3001;
    await app.listen(port);
    logger.log(`Auth Service running on port ${port}`);
}
bootstrap();
