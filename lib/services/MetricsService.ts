/**
 * Metrics Service - Track Gemini API requests
 *
 * Tracks for each Gemini request:
 * - Audio character length (from transcription)
 * - Audio duration (in seconds)
 * - Input tokens
 * - Output tokens
 * - Cost (USD)
 * - User ID
 * - Model name
 */

import { Axiom } from "@axiomhq/js";

interface GeminiMetrics {
  model: string;
  audio_characters: number; // Number of characters in transcription
  audio_duration_seconds: number; // Audio duration in seconds
  tokens_input: number;
  tokens_output: number;
  cost_usd: number;
  request_id?: string; // Optional request ID for debugging duplicates
}

class MetricsService {
  private axiom: Axiom | null = null;
  private enabled: boolean;

  constructor() {
    const token = process.env.AXIOM_TOKEN;
    this.enabled = !!token;

    if (this.enabled) {
      this.axiom = new Axiom({
        token: token!,
        orgId: process.env.AXIOM_ORG_ID,
      });
      console.log("[Metrics] Axiom enabled - Gemini tracking active");
    } else {
      console.log("[Metrics] Axiom not configured (metrics will only be logged)");
    }
  }

  /**
   * Track Gemini API request
   * Tracks: audio character length, audio duration, tokens, cost, user ID, model
   */
  async trackGemini(metrics: GeminiMetrics): Promise<void> {
    const data = {
      model: metrics.model,
      audio_characters: metrics.audio_characters,
      audio_duration_seconds: metrics.audio_duration_seconds,
      tokens_input: metrics.tokens_input,
      tokens_output: metrics.tokens_output,
      cost_usd: metrics.cost_usd,
      request_id: metrics.request_id || `unknown-${Date.now()}`,
      timestamp: new Date().toISOString(),
    };

    console.log(
      `[Metrics] Gemini request - Model: ${metrics.model}, ` +
        `Audio: ${metrics.audio_duration_seconds}s (${metrics.audio_characters} chars), ` +
        `Tokens: ${metrics.tokens_input} in / ${metrics.tokens_output} out, ` +
        `Cost: $${metrics.cost_usd.toFixed(6)}`
    );

    await this.send(data);
  }

  /**
   * Send data to Axiom
   */
  private async send(data: Record<string, any>): Promise<void> {
    if (!this.enabled || !this.axiom) return;

    try {
      await this.axiom.ingest("reelify-metrics", [data]);
    } catch (error: any) {
      // Silently ignore dataset errors - don't spam logs
      if (!error?.message?.includes("dataset not found")) {
        console.error("[Metrics] Failed to send to Axiom:", error?.message || error);
      }
    }
  }

  /**
   * Calculate Gemini cost based on token usage
   * Pricing: https://ai.google.dev/gemini-api/docs/pricing
   *
   * Note: Pricing is per 1M tokens in USD for Paid Tier (Standard)
   * Models with tiered pricing use <= 200k tokens threshold
   */
  calculateGeminiCost(model: string, inputTokens: number, outputTokens: number): number {
    // Helper to determine pricing tier based on input token count
    const isLargePrompt = (tokens: number) => tokens > 200_000;

    // Pricing structure: { input: [small, large], output: [small, large] }
    // For models without tiered pricing, both values are the same
    const pricing: Record<string, { input: [number, number]; output: [number, number] }> = {
      // Gemini 3 Pro Preview - tiered pricing
      "gemini-3-pro-preview": {
        input: [2.0, 4.0], // $2.00 (<=200k), $4.00 (>200k)
        output: [12.0, 18.0], // $12.00 (<=200k), $18.00 (>200k)
      },
      // Gemini 3 Flash Preview - fixed pricing
      "gemini-3-flash-preview": {
        input: [0.5, 0.5], // $0.50 (text/image/video), $1.00 (audio) - using text pricing
        output: [3.0, 3.0], // $3.00
      },
      // Gemini 2.5 Pro - tiered pricing
      "gemini-2.5-pro": {
        input: [1.25, 2.5], // $1.25 (<=200k), $2.50 (>200k)
        output: [10.0, 15.0], // $10.00 (<=200k), $15.00 (>200k)
      },
      // Gemini 2.5 Flash - fixed pricing
      "gemini-2.5-flash": {
        input: [0.3, 0.3], // $0.30 (text/image/video), $1.00 (audio) - using text pricing
        output: [2.5, 2.5], // $2.50
      },
      // Gemini 2.5 Flash-Lite - fixed pricing
      "gemini-2.5-flash-lite": {
        input: [0.1, 0.1], // $0.10 (text/image/video), $0.30 (audio) - using text pricing
        output: [0.4, 0.4], // $0.40
      },
      // Gemini 2.5 Flash Preview - fixed pricing
      "gemini-2.5-flash-preview-09-2025": {
        input: [0.3, 0.3], // $0.30 (text/image/video), $1.00 (audio) - using text pricing
        output: [2.5, 2.5], // $2.50
      },
      // Gemini 2.0 Flash - fixed pricing
      "gemini-2.0-flash": {
        input: [0.1, 0.1], // $0.10 (text/image/video), $0.70 (audio) - using text pricing
        output: [0.4, 0.4], // $0.40
      },
      // Gemini 2.0 Flash-Lite - fixed pricing
      "gemini-2.0-flash-lite": {
        input: [0.075, 0.075], // $0.075
        output: [0.3, 0.3], // $0.30
      },
      // Legacy models (fallback)
      "gemini-1.5-pro": {
        input: [1.25, 2.5], // Approximate - using 2.5 Pro pricing
        output: [5.0, 7.5], // Approximate
      },
      "gemini-1.5-flash": {
        input: [0.075, 0.075], // Approximate - using 2.0 Flash-Lite pricing
        output: [0.3, 0.3], // Approximate
      },
    };

    // Get pricing for model or use default
    const modelPricing = pricing[model] || pricing["gemini-3-flash-preview"];

    // Determine which tier to use based on input token count
    const tier = isLargePrompt(inputTokens) ? 1 : 0;

    // Calculate costs (pricing is per 1M tokens)
    const inputCost = (inputTokens / 1_000_000) * modelPricing.input[tier];
    const outputCost = (outputTokens / 1_000_000) * modelPricing.output[tier];

    return inputCost + outputCost;
  }
}

// Singleton instance
export const metrics = new MetricsService();

// Export types
export type { GeminiMetrics };
