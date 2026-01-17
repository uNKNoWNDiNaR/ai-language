"use strict";
// src/db/mongo.ts 
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectMongo = connectMongo;
const mongoose_1 = __importDefault(require("mongoose"));
async function connectMongo() {
    try {
        await mongoose_1.default.connect(process.env.MONGO_URI);
        console.log("Mongo Connected");
    }
    catch (err) {
        console.error("Mongo connection error", err);
        process.exit(1);
    }
}
