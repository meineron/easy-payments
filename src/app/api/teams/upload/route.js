import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Team from "@/models/Team";
import * as XLSX from "xlsx";

function excelDateToJS(serial) {
  return new Date((serial - 25569) * 86400 * 1000);
}

function detectGender(name) {
  const lower = name.toLowerCase();
  if (lower.includes("girls") || lower.includes("female")) return "Female";
  if (lower.includes("boys") || lower.includes("male")) return "Male";
  return null;
}

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const season = formData.get("season") || "26/27";

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });

    if (rows.length < 2) {
      return NextResponse.json({ error: "File is empty or has no data rows" }, { status: 400 });
    }

    const header = rows[0].map((h) => String(h).toLowerCase().trim());
    const nameIdx = header.findIndex((h) => h.includes("team") || h.includes("name"));
    const feeIdx = header.findIndex((h) => h.includes("fee") || h.includes("cost") || h.includes("price"));
    const dateIdx = header.findIndex((h) => h.includes("start") || h.includes("date") || h.includes("time"));
    let typeIdx = header.findIndex((h) => h.includes("type") || h.includes("category") || h.includes("program"));
    const discountIdx = header.findIndex((h) => h.includes("discount") || h.includes("loyalty"));

    if (nameIdx === -1) {
      return NextResponse.json({ error: "Could not find Team Name column. Expected a header like 'Team Name' or 'Name'." }, { status: 400 });
    }

    const knownIndices = [nameIdx, feeIdx, dateIdx].filter((i) => i !== -1);
    const maxKnownIdx = Math.max(...knownIndices);
    if (typeIdx === -1) {
      const firstDataRow = rows[1];
      if (firstDataRow && firstDataRow.length > maxKnownIdx + 1) {
        typeIdx = maxKnownIdx + 1;
      }
    }

    const docs = [];
    const errors = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      const name = row[nameIdx] ? String(row[nameIdx]).trim() : "";
      const fee = feeIdx !== -1 ? parseFloat(row[feeIdx]) : NaN;
      let startDate = null;

      if (dateIdx !== -1 && row[dateIdx]) {
        const val = row[dateIdx];
        if (typeof val === "number") {
          startDate = excelDateToJS(val);
        } else {
          startDate = new Date(val);
        }
        if (startDate && isNaN(startDate.getTime())) startDate = null;
      }

      if (!name) continue;

      const gender = detectGender(name) || "";
      const teamType = (typeIdx !== -1 && row[typeIdx]) ? String(row[typeIdx]).trim() : "";
      const loyaltyDiscount = (discountIdx !== -1 && row[discountIdx]) ? parseFloat(row[discountIdx]) : 0;

      docs.push({
        clubId: session.user.id,
        name,
        season,
        gender,
        teamType,
        costCents: !isNaN(fee) && fee >= 0 ? Math.round(fee * 100) : 0,
        loyaltyDiscountCents: Math.max(Math.round((loyaltyDiscount || 0) * 100), 0),
        activityStartDate: startDate,
      });
    }

    if (docs.length === 0) {
      return NextResponse.json({
        error: "No valid teams found in the file",
        errors,
      }, { status: 400 });
    }

    await dbConnect();
    const teams = await Team.insertMany(docs);

    return NextResponse.json({
      teams,
      created: teams.length,
      errors: errors.length > 0 ? errors : undefined,
    }, { status: 201 });
  } catch (error) {
    console.error("Upload teams error:", error);
    return NextResponse.json({ error: "Failed to process file" }, { status: 500 });
  }
}
