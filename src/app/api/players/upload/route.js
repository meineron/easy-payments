import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Player from "@/models/Player";
import Parent from "@/models/Parent";
import Team from "@/models/Team";
import * as XLSX from "xlsx";

function normalizePhone(raw) {
  if (!raw) return "";
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return digits.slice(1);
  }
  return digits;
}

function detectGender(name) {
  const lower = name.toLowerCase();
  if (lower.includes("girls") || lower.includes("female")) return "Female";
  if (lower.includes("boys") || lower.includes("male")) return "Male";
  return "";
}

function csvGender(val) {
  if (!val) return "";
  const lower = String(val).toLowerCase().trim();
  if (lower === "male" || lower === "m") return "Male";
  if (lower === "female" || lower === "f") return "Female";
  return "";
}

function parseSeason(raw) {
  if (!raw) return "";
  const s = String(raw).trim();
  const match = s.match(/^(\d{4})-(\d{4})$/);
  if (match) {
    return match[1].slice(2) + "/" + match[2].slice(2);
  }
  if (/^\d{2}\/\d{2}$/.test(s)) return s;
  return s;
}

function col(headers, ...names) {
  for (const name of names) {
    const idx = headers.indexOf(name);
    if (idx !== -1) return idx;
  }
  return -1;
}

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: false });

    if (rows.length < 2) {
      return NextResponse.json({ error: "File is empty or has no data rows" }, { status: 400 });
    }

    const headers = rows[0].map((h) => String(h).toLowerCase().trim());

    const C = {
      firstName: col(headers, "player_first_name"),
      lastName: col(headers, "player_last_name"),
      dob: col(headers, "dob"),
      gender: col(headers, "gender"),
      primaryPosition: col(headers, "primary_position"),
      secondaryPosition: col(headers, "secondary_position"),
      school: col(headers, "school"),
      joinDate: col(headers, "join_date"),
      phone: col(headers, "phone"),
      address: col(headers, "address"),
      city: col(headers, "city"),
      state: col(headers, "state"),
      zip: col(headers, "zip"),
      email: col(headers, "email"),
      contactFirstName: col(headers, "contact_first_name"),
      contactLastName: col(headers, "contact_last_name"),
      allContactsEmail: col(headers, "all_contacts_email"),
      secContactFirstName: col(headers, "secondary_contact_first_name"),
      secContactLastName: col(headers, "secondary_contact_last_name"),
      secContactEmail: col(headers, "secondary_contact_email"),
      secContactPhone: col(headers, "secondary_contact_phone"),
      teamName: col(headers, "team_name"),
      teamYear: col(headers, "team_year"),
      season: col(headers, "season"),
    };

    if (C.firstName === -1 || C.lastName === -1) {
      return NextResponse.json({ error: "Could not find player_first_name and player_last_name columns" }, { status: 400 });
    }

    await dbConnect();

    const clubId = session.user.id;
    const errors = [];
    const stats = { players: { created: 0, updated: 0 }, parents: { created: 0, updated: 0 }, teams: { created: 0, existing: 0 } };

    const existingTeams = await Team.find({ clubId });
    const teamsByName = {};
    for (const t of existingTeams) {
      teamsByName[t.name.toLowerCase()] = t;
    }

    const existingParents = await Parent.find({ clubId });
    const parentsByEmail = {};
    const parentsByPhone = {};
    for (const p of existingParents) {
      if (p.email) parentsByEmail[p.email.toLowerCase()] = p;
      const norm = normalizePhone(p.phone);
      if (norm) parentsByPhone[norm] = p;
    }

    const existingPlayers = await Player.find({ clubId });
    const playerKey = (fn, ln, dob) => `${fn.toLowerCase().trim()}|${ln.toLowerCase().trim()}|${dob || ""}`;
    const playersByKey = {};
    for (const pl of existingPlayers) {
      const dob = pl.dateOfBirth ? pl.dateOfBirth.toISOString().split("T")[0] : "";
      playersByKey[playerKey(pl.firstName, pl.lastName, dob)] = pl;
    }

    function getCell(row, idx) {
      if (idx === -1 || !row[idx]) return "";
      return String(row[idx]).trim();
    }

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      const firstName = getCell(row, C.firstName);
      const lastName = getCell(row, C.lastName);
      if (!firstName || !lastName) {
        errors.push(`Row ${i + 1}: Missing player name`);
        continue;
      }

      try {
        const dob = getCell(row, C.dob) || null;
        const gender = csvGender(getCell(row, C.gender));
        const primaryPosition = getCell(row, C.primaryPosition);
        const secondaryPosition = getCell(row, C.secondaryPosition);
        const school = getCell(row, C.school);
        const joinDateStr = getCell(row, C.joinDate);
        const joinDate = joinDateStr ? new Date(joinDateStr) : null;
        const rawPhone = getCell(row, C.phone);
        const phoneNumber = normalizePhone(rawPhone);
        const address = getCell(row, C.address);
        const city = getCell(row, C.city);
        const state = getCell(row, C.state);
        const zip = getCell(row, C.zip);
        const playerEmail = getCell(row, C.email);
        const teamName = getCell(row, C.teamName);
        const teamYear = getCell(row, C.teamYear);
        const season = parseSeason(getCell(row, C.season));

        let team = null;
        if (teamName) {
          const teamKey = teamName.toLowerCase();
          if (teamsByName[teamKey]) {
            team = teamsByName[teamKey];
            stats.teams.existing++;
          } else {
            const teamGender = detectGender(teamName);
            team = await Team.create({
              clubId,
              name: teamName,
              season: season || "25/26",
              gender: teamGender,
              year: teamYear || "",
              costCents: 0,
              activityStartDate: null,
            });
            teamsByName[teamKey] = team;
            stats.teams.created++;
          }
        }

        const pk = playerKey(firstName, lastName, dob);
        let player = playersByKey[pk];
        if (player) {
          let changed = false;
          if (primaryPosition && !player.primaryPosition) { player.primaryPosition = primaryPosition; changed = true; }
          if (secondaryPosition && !player.secondaryPosition) { player.secondaryPosition = secondaryPosition; changed = true; }
          if (school && !player.school) { player.school = school; changed = true; }
          if (gender && !player.gender) { player.gender = gender; changed = true; }
          if (phoneNumber && !player.phoneNumber) { player.phoneNumber = phoneNumber; changed = true; }
          if (address && !player.address) { player.address = address; changed = true; }
          if (city && !player.city) { player.city = city; changed = true; }
          if (state && !player.state) { player.state = state; changed = true; }
          if (zip && !player.zip) { player.zip = zip; changed = true; }
          if (playerEmail && !player.email) { player.email = playerEmail.toLowerCase(); changed = true; }
          if (joinDate && !player.joinDate) { player.joinDate = joinDate; changed = true; }

          if (team) {
            const alreadyHasTeam = player.teams.some(
              (t) => t.teamId.toString() === team._id.toString() && t.season === (season || "25/26")
            );
            if (!alreadyHasTeam) {
              player.teams.push({ teamId: team._id, season: season || "25/26" });
              changed = true;
            }
            if (!player.registrationTeamId) {
              player.registrationTeamId = team._id;
              changed = true;
            }
          }

          if (changed) {
            await player.save();
            stats.players.updated++;
          }
        } else {
          const teams = team ? [{ teamId: team._id, season: season || "25/26" }] : [];
          player = await Player.create({
            clubId,
            firstName,
            lastName,
            dateOfBirth: dob ? new Date(dob) : null,
            gender,
            primaryPosition,
            secondaryPosition,
            school,
            joinDate,
            phoneNumber,
            address,
            city,
            state,
            zip,
            email: playerEmail ? playerEmail.toLowerCase() : "",
            registrationTeamId: team ? team._id : null,
            teams,
            parents: [],
          });
          playersByKey[pk] = player;
          stats.players.created++;
        }

        const contactFirst = getCell(row, C.contactFirstName);
        const contactLast = getCell(row, C.contactLastName);
        const allEmailsRaw = getCell(row, C.allContactsEmail);
        const contactEmail = allEmailsRaw ? allEmailsRaw.split(";")[0].trim().toLowerCase() : "";
        const contactPhone = normalizePhone(rawPhone);

        if (contactFirst && contactLast && (contactEmail || contactPhone)) {
          let parent = null;
          if (contactEmail) parent = parentsByEmail[contactEmail];
          if (!parent && contactPhone) parent = parentsByPhone[contactPhone];

          if (parent) {
            if (!parent.players.some((pid) => pid.toString() === player._id.toString())) {
              parent.players.push(player._id);
              await parent.save();
            }
            if (!player.parents.some((pid) => pid.toString() === parent._id.toString())) {
              player.parents.push(parent._id);
              await player.save();
            }
            stats.parents.updated++;
          } else {
            try {
              parent = await Parent.create({
                clubId,
                firstName: contactFirst,
                lastName: contactLast,
                email: contactEmail || `noemail_${Date.now()}_${i}@placeholder.local`,
                phonePrefix: "+1",
                phone: contactPhone || "",
                players: [player._id],
              });
              if (contactEmail) parentsByEmail[contactEmail] = parent;
              if (contactPhone) parentsByPhone[contactPhone] = parent;
              player.parents.push(parent._id);
              await player.save();
              stats.parents.created++;
            } catch (dupErr) {
              if (dupErr.code === 11000) {
                parent = await Parent.findOne({ clubId, email: contactEmail });
                if (parent) {
                  if (!parent.players.some((pid) => pid.toString() === player._id.toString())) {
                    parent.players.push(player._id);
                    await parent.save();
                  }
                  if (!player.parents.some((pid) => pid.toString() === parent._id.toString())) {
                    player.parents.push(parent._id);
                    await player.save();
                  }
                  if (contactEmail) parentsByEmail[contactEmail] = parent;
                  if (contactPhone) parentsByPhone[normalizePhone(parent.phone)] = parent;
                  stats.parents.updated++;
                }
              } else {
                errors.push(`Row ${i + 1}: Failed to create primary contact - ${dupErr.message}`);
              }
            }
          }
        }

        const secFirst = getCell(row, C.secContactFirstName);
        const secLast = getCell(row, C.secContactLastName);
        const secEmail = getCell(row, C.secContactEmail) ? getCell(row, C.secContactEmail).toLowerCase() : "";
        const secPhone = normalizePhone(getCell(row, C.secContactPhone));

        if (secFirst && secLast && (secEmail || secPhone)) {
          let secParent = null;
          if (secEmail) secParent = parentsByEmail[secEmail];
          if (!secParent && secPhone) secParent = parentsByPhone[secPhone];

          if (secParent) {
            if (!secParent.players.some((pid) => pid.toString() === player._id.toString())) {
              secParent.players.push(player._id);
              await secParent.save();
            }
            if (!player.parents.some((pid) => pid.toString() === secParent._id.toString())) {
              player.parents.push(secParent._id);
              await player.save();
            }
            stats.parents.updated++;
          } else {
            try {
              secParent = await Parent.create({
                clubId,
                firstName: secFirst,
                lastName: secLast,
                email: secEmail || `noemail_sec_${Date.now()}_${i}@placeholder.local`,
                phonePrefix: "+1",
                phone: secPhone || "",
                players: [player._id],
              });
              if (secEmail) parentsByEmail[secEmail] = secParent;
              if (secPhone) parentsByPhone[secPhone] = secParent;
              player.parents.push(secParent._id);
              await player.save();
              stats.parents.created++;
            } catch (dupErr) {
              if (dupErr.code === 11000) {
                secParent = await Parent.findOne({ clubId, email: secEmail });
                if (secParent) {
                  if (!secParent.players.some((pid) => pid.toString() === player._id.toString())) {
                    secParent.players.push(player._id);
                    await secParent.save();
                  }
                  if (!player.parents.some((pid) => pid.toString() === secParent._id.toString())) {
                    player.parents.push(secParent._id);
                    await player.save();
                  }
                  if (secEmail) parentsByEmail[secEmail] = secParent;
                  if (secPhone) parentsByPhone[normalizePhone(secParent.phone)] = secParent;
                  stats.parents.updated++;
                }
              } else {
                errors.push(`Row ${i + 1}: Failed to create secondary contact - ${dupErr.message}`);
              }
            }
          }
        }
      } catch (rowErr) {
        errors.push(`Row ${i + 1}: ${rowErr.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      stats,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Upload players CSV error:", error);
    return NextResponse.json({ error: "Failed to process file" }, { status: 500 });
  }
}
