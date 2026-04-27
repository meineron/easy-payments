import { getClubContext, dualCreate } from "@/lib/club-context";

async function _GET(req, res) {
  try {
    const { ctx, error } = await getClubContext(req, res);
    if (error) return res.status(200).json(error.body, { status: error.status });
    const { Parent, Player } = ctx.models;
    void Player;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim();

    const query = { clubId: ctx.clubId };
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = { $regex: escaped, $options: "i" };
      query.$or = [
        { firstName: re },
        { lastName: re },
        { email: re },
        { phone: re },
      ];
    }

    const parents = await Parent.find(query)
      .populate("players", "firstName lastName dateOfBirth gender primaryPosition")
      .sort({ createdAt: -1 })
      .limit(search ? 20 : 0);

    return res.status(200).json({ parents });
  } catch (error) {
    console.error("List parents error:", error);
    return res.status(500).json({ error: "Failed to list parents" });
  }
}

async function _POST(req, res) {
  try {
    const { ctx, error } = await getClubContext(req, res);
    if (error) return res.status(200).json(error.body, { status: error.status });

    const { firstName, lastName, email, phonePrefix, phone } = req.body;

    if (!firstName || !lastName || !email || !phone) {
      return res.status(200).json({ error: "First name, last name, email, and phone are required" }, { status: 400 });
    }

    const parent = await dualCreate(ctx, "Parent", {
      clubId: ctx.clubId,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      phonePrefix: (phonePrefix || "+1").trim(),
      phone: phone.trim(),
      players: [],
    });

    return res.status(201).json({ parent });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: "A parent with this email already exists" });
    }
    console.error("Create parent error:", error);
    return res.status(500).json({ error: "Failed to create parent" });
  }
}
export default async function handler(req, res) {
  if (req.method === "GET") {
    return _GET(req, res);
  } else if (req.method === "POST") {
    return _POST(req, res);
  } else {
    return res.status(405).json({ error: "Method not allowed" });
  }
}
