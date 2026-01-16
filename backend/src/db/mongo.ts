// src/db/mongo.ts 

import mongoose from "mongoose";


export async function connectMongo() {
    try{
        await mongoose.connect(process.env.MONGO_URI as string);
        console.log("Mongo Connected");
    } catch(err){
        console.error("Mongo connection error", err);
        process.exit(1);
    }
}

