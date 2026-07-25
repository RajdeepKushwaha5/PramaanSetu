import { Router } from "express";
import { getCampaigns, getDashboardStats } from "../services/campaignService.js";
import { buildCampaignEvidence, buildSnapshot } from "../services/evidenceService.js";
import { getStore } from "../db/store.js";

export const campaignsRouter = Router();

campaignsRouter.get("/campaigns", (_req, res) => {
  res.json(getCampaigns());
});

campaignsRouter.get("/dashboard", (_req, res) => {
  res.json(getDashboardStats());
});

campaignsRouter.get("/log", (_req, res) => {
  const store = getStore();
  res.json({ integrity: store.verifyLog(), entries: store.getLog() });
});

campaignsRouter.get("/events", (_req, res) => {
  res.json(getStore().listEvents().slice(-100).reverse());
});

// Regulator-ready evidence export.
campaignsRouter.get("/evidence", (_req, res) => {
  res.json(buildSnapshot());
});

campaignsRouter.get("/evidence/:campaignId", (req, res) => {
  const pack = buildCampaignEvidence(Number(req.params.campaignId));
  if (!pack) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }
  res
    .setHeader(
      "Content-Disposition",
      `attachment; filename="evidence-campaign-${req.params.campaignId}.json"`,
    )
    .json(pack);
});
