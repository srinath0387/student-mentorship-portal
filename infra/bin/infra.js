#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("source-map-support/register");
const cdk = require("aws-cdk-lib");
const advitiyans_stack_1 = require("../lib/advitiyans-stack");
const app = new cdk.App();
new advitiyans_stack_1.AdvitiyansStack(app, 'AdvitiyansStack', {
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT || '071340280897',
        region: process.env.CDK_DEFAULT_REGION || 'ap-south-1',
    },
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5mcmEuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmZyYS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFDQSx1Q0FBcUM7QUFDckMsbUNBQW1DO0FBQ25DLDhEQUEwRDtBQUUxRCxNQUFNLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLEVBQUUsQ0FBQztBQUMxQixJQUFJLGtDQUFlLENBQUMsR0FBRyxFQUFFLGlCQUFpQixFQUFFO0lBQzFDLEdBQUcsRUFBRTtRQUNILE9BQU8sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLG1CQUFtQixJQUFJLGNBQWM7UUFDMUQsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsa0JBQWtCLElBQUksWUFBWTtLQUN2RDtDQUNGLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIiMhL3Vzci9iaW4vZW52IG5vZGVcbmltcG9ydCAnc291cmNlLW1hcC1zdXBwb3J0L3JlZ2lzdGVyJztcbmltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBBZHZpdGl5YW5zU3RhY2sgfSBmcm9tICcuLi9saWIvYWR2aXRpeWFucy1zdGFjayc7XG5cbmNvbnN0IGFwcCA9IG5ldyBjZGsuQXBwKCk7XG5uZXcgQWR2aXRpeWFuc1N0YWNrKGFwcCwgJ0Fkdml0aXlhbnNTdGFjaycsIHtcbiAgZW52OiB7XG4gICAgYWNjb3VudDogcHJvY2Vzcy5lbnYuQ0RLX0RFRkFVTFRfQUNDT1VOVCB8fCAnMDcxMzQwMjgwODk3JyxcbiAgICByZWdpb246IHByb2Nlc3MuZW52LkNES19ERUZBVUxUX1JFR0lPTiB8fCAnYXAtc291dGgtMScsXG4gIH0sXG59KTtcbiJdfQ==