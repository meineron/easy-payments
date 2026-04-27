import { getClubContext, dualCreate } from "@/lib/club-context";
import { recordPublicLookup } from "@/lib/public-lookup";
import mongoose from "mongoose";

function defaultFormSections() {
  return [
    {
      key: "player_details",
      title: "Player Information",
      order: 0,
      isDefault: true,
      fields: [
        { key: "player_firstName", type: "input", label: "First Name", required: true, hidden: false, isDefault: true, isMust: true, order: 0, options: [] },
        { key: "player_lastName", type: "input", label: "Last Name", required: true, hidden: false, isDefault: true, isMust: true, order: 1, options: [] },
        { key: "player_gender", type: "dropdown_single", label: "Gender", required: true, hidden: false, isDefault: true, isMust: true, order: 2, options: ["Male", "Female"] },
        { key: "player_dob", type: "date", label: "Date of Birth", required: true, hidden: false, isDefault: true, isMust: true, order: 3, options: [] },
        { key: "player_phone", type: "phone", label: "Phone Number", required: false, hidden: false, isDefault: true, isMust: false, order: 4, options: [] },
        { key: "player_email", type: "email", label: "Email", required: false, hidden: false, isDefault: true, isMust: false, order: 5, options: [] },
        { key: "player_address", type: "address", label: "Address", required: true, hidden: false, isDefault: true, isMust: false, order: 6, options: [] },
      ],
    },
    {
      key: "parents_details",
      title: "Parents Details",
      order: 1,
      isDefault: true,
      fields: [
        { key: "parent1_firstName", type: "input", label: "Parent 1 - First Name", required: true, hidden: false, isDefault: true, isMust: true, order: 0, options: [] },
        { key: "parent1_lastName", type: "input", label: "Parent 1 - Last Name", required: true, hidden: false, isDefault: true, isMust: true, order: 1, options: [] },
        { key: "parent1_phone", type: "phone", label: "Parent 1 - Phone", required: true, hidden: false, isDefault: true, isMust: true, order: 2, options: [] },
        { key: "parent1_email", type: "email", label: "Parent 1 - Email", required: true, hidden: false, isDefault: true, isMust: true, order: 3, options: [] },
        { key: "parent2_firstName", type: "input", label: "Parent 2 - First Name", required: false, hidden: false, isDefault: true, isMust: false, order: 4, options: [] },
        { key: "parent2_lastName", type: "input", label: "Parent 2 - Last Name", required: false, hidden: false, isDefault: true, isMust: false, order: 5, options: [] },
        { key: "parent2_phone", type: "phone", label: "Parent 2 - Phone", required: false, hidden: false, isDefault: true, isMust: false, order: 6, options: [] },
        { key: "parent2_email", type: "email", label: "Parent 2 - Email", required: false, hidden: false, isDefault: true, isMust: false, order: 7, options: [] },
      ],
    },
    { key: "waivers", title: "Waivers", order: 2, isDefault: true, fields: [] },
  ];
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    try {
      const { ctx, error } = await getClubContext(req, res);
      if (error) return res.status(error.status).json(error.body);

      const activities = await ctx.models.Activity.find({ clubId: ctx.clubId })
        .select("title type season status hasPayment startDate endDate lastRegisterDate teams createdAt")
        .sort({ createdAt: -1 });

      return res.status(200).json({ activities });
    } catch (err) {
      console.error("List activities error:", err);
      return res.status(500).json({ error: "Failed to list activities" });
    }
  }

  if (req.method === "POST") {
    try {
      const { ctx, error } = await getClubContext(req, res);
      if (error) return res.status(error.status).json(error.body);

      const body = req.body;
      const { title } = body;

      if (!title || !title.trim()) {
        return res.status(400).json({ error: "Title is required" });
      }

      const activity = await dualCreate(ctx, "Activity", {
        _id: new mongoose.Types.ObjectId(),
        clubId: ctx.clubId,
        title: title.trim(),
        type: body.type || "Season Registration",
        season: body.season || "",
        startDate: body.startDate,
        formSections: defaultFormSections(),
      });

      await recordPublicLookup("activity", String(activity._id), ctx.clubId);

      return res.status(201).json({ activity });
    } catch (err) {
      console.error("Create activity error:", err);
      return res.status(500).json({ error: "Failed to create activity" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
