import { getClubContext, dualCreate, dualSave } from "@/lib/club-context";
import * as XLSX from "xlsx";
import { toDobString } from "@/lib/dob";

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

function rangersFormSections() {
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
        { key: "allergies", type: "textarea", label: "Allergies", required: true, hidden: false, isDefault: false, isMust: false, order: 7, options: [] },
        { key: "medical_conditions", type: "textarea", label: "Medical Conditions", required: false, hidden: false, isDefault: false, isMust: false, order: 8, options: [] },
        { key: "school_attend", type: "text", label: "What School does your athlete attend?", required: false, hidden: false, isDefault: false, isMust: false, order: 9, options: [] },
        { key: "current_club", type: "text", label: "Current club (if none type N/A)", required: false, hidden: false, isDefault: false, isMust: false, order: 10, options: [] },
        { key: "current_team", type: "text", label: "Current Team (if none type N/A)", required: false, hidden: false, isDefault: false, isMust: false, order: 11, options: [] },
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
    {
      key: "waivers",
      title: "Waivers",
      order: 2,
      isDefault: true,
      fields: [],
    },
  ];
}

async function processRangersUpload(rows, headers, ctx) {
  const { Player, Parent, Activity, Order } = ctx.models;
  const clubId = ctx.clubId;
  const errors = [];
  const stats = {
    players: { created: 0, updated: 0 },
    parents: { created: 0, updated: 0 },
    orders: { created: 0 },
  };

  function getCell(row, idx) {
    if (idx === -1 || !row[idx]) return "";
    return String(row[idx]).trim();
  }

  const R = {
    registrationId: col(headers, "registration id"),
    created: col(headers, "created"),
    firstName: col(headers, "first name"),
    lastName: col(headers, "last name"),
    gender: col(headers, "gender"),
    dob: col(headers, "dob"),
    contactEmail: col(headers, "contact email"),
    phone: col(headers, "phone"),
    allergies: col(headers, "allergies"),
    medicalConditions: col(headers, "medical conditions"),
    g1FirstName: col(headers, "guardian 1 first name"),
    g1LastName: col(headers, "guardian 1 last name"),
    g1Email: col(headers, "guardian 1 email address"),
    g1Address: col(headers, "guardian 1 address"),
    g1City: col(headers, "guardian 1 city"),
    g1State: col(headers, "guardian 1 state/province"),
    g1Zip: col(headers, "guardian 1 postal code"),
    g1Phone: col(headers, "guardian 1 mobile phone number"),
    g1AltPhone: col(headers, "guardian 1 alternate phone number"),
    g2FirstName: col(headers, "guardian 2 first name"),
    g2LastName: col(headers, "guardian 2 last name"),
    g2Email: col(headers, "guardian 2 email address"),
    g2AltEmail: col(headers, "guardian 2 alternate email"),
    g2Phone: col(headers, "guardian 2 mobile phone number"),
    g2AltPhone: col(headers, "guardian 2 alternate phone number"),
    physicianFirst: col(headers, "physician first name"),
    physicianLast: col(headers, "physician last name"),
    physicianPhone: col(headers, "physician phone number"),
    physicianAltPhone: col(headers, "physician alt phone number"),
    insuranceProvider: col(headers, "insurance provider"),
    insuranceProviderPhone: col(headers, "insurance provider phone"),
    insurancePolicyHolderFirst: col(headers, "insurance policy holder first name"),
    insurancePolicyHolderLast: col(headers, "insurance policy holder last name"),
    insurancePolicyNumber: col(headers, "insurance policy number"),
    schoolAttend: col(headers, "what school does your athlete attend?"),
    currentClub: col(headers, "current club (if none type n/a)"),
    currentTeam: col(headers, "current team (if none type n/a)"),
  };

  if (R.firstName === -1 || R.lastName === -1) {
    return { error: "Could not find 'First Name' and 'Last Name' columns in the Rangers CSV" };
  }

  let activity = await Activity.findOne({ clubId, title: "2026 - 2027 Tampa Rangers" });
  if (!activity) {
    activity = await dualCreate(ctx, "Activity", {
      clubId,
      title: "2026 - 2027 Tampa Rangers",
      type: "Season Registration",
      season: "26/27",
      hasPayment: true,
      formSections: rangersFormSections(),
    });
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
    const dob = toDobString(pl.dateOfBirth) || "";
    playersByKey[playerKey(pl.firstName, pl.lastName, dob)] = pl;
  }

  async function upsertParent(firstName, lastName, email, phone, altPhone, player, rowIdx) {
    const normEmail = email ? email.toLowerCase().trim() : "";
    const normPhone = normalizePhone(phone);

    if (!firstName || !lastName || (!normEmail && !normPhone)) return null;

    let parent = null;
    if (normEmail) parent = parentsByEmail[normEmail];
    if (!parent && normPhone) parent = parentsByPhone[normPhone];

    if (parent) {
      let changed = false;
      if (!parent.players.some((pid) => pid.toString() === player._id.toString())) {
        parent.players.push(player._id);
        changed = true;
      }
      if (altPhone && !parent.alternatePhone) {
        parent.alternatePhone = normalizePhone(altPhone);
        changed = true;
      }
      if (changed) await dualSave(ctx, parent);
      if (!player.parents.some((pid) => pid.toString() === parent._id.toString())) {
        player.parents.push(parent._id);
        await dualSave(ctx, player);
      }
      stats.parents.updated++;
      return parent;
    }

    try {
      parent = await dualCreate(ctx, "Parent", {
        clubId,
        firstName,
        lastName,
        email: normEmail || `noemail_${Date.now()}_${rowIdx}@placeholder.local`,
        phonePrefix: "+1",
        phone: normPhone || "",
        alternatePhone: normalizePhone(altPhone),
        players: [player._id],
      });
      if (normEmail) parentsByEmail[normEmail] = parent;
      if (normPhone) parentsByPhone[normPhone] = parent;
      player.parents.push(parent._id);
      await dualSave(ctx, player);
      stats.parents.created++;
      return parent;
    } catch (dupErr) {
      if (dupErr.code === 11000) {
        parent = await Parent.findOne({ clubId, email: normEmail });
        if (parent) {
          if (!parent.players.some((pid) => pid.toString() === player._id.toString())) {
            parent.players.push(player._id);
            await dualSave(ctx, parent);
          }
          if (!player.parents.some((pid) => pid.toString() === parent._id.toString())) {
            player.parents.push(parent._id);
            await dualSave(ctx, player);
          }
          if (normEmail) parentsByEmail[normEmail] = parent;
          if (normPhone) parentsByPhone[normPhone] = parent;
          stats.parents.updated++;
          return parent;
        }
      }
      errors.push(`Row ${rowIdx + 1}: Failed to create parent ${firstName} ${lastName} - ${dupErr.message}`);
      return null;
    }
  }

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const firstName = getCell(row, R.firstName);
    const lastName = getCell(row, R.lastName);
    if (!firstName || !lastName) {
      errors.push(`Row ${i + 1}: Missing player name`);
      continue;
    }

    try {
      const dob = toDobString(getCell(row, R.dob));
      const gender = csvGender(getCell(row, R.gender));
      const rawPhone = getCell(row, R.phone);
      const phoneNumber = normalizePhone(rawPhone);
      const playerEmail = getCell(row, R.contactEmail);
      const address = getCell(row, R.g1Address);
      const city = getCell(row, R.g1City);
      const state = getCell(row, R.g1State);
      const zip = getCell(row, R.g1Zip);
      const previousId = getCell(row, R.registrationId);
      const createdDate = getCell(row, R.created);

      const school = getCell(row, R.schoolAttend);

      const extraData = {};
      const physicianFirst = getCell(row, R.physicianFirst);
      const physicianLast = getCell(row, R.physicianLast);
      if (physicianFirst) extraData.physicianFirstName = physicianFirst;
      if (physicianLast) extraData.physicianLastName = physicianLast;
      const physicianPhone = getCell(row, R.physicianPhone);
      const physicianAltPhone = getCell(row, R.physicianAltPhone);
      if (physicianPhone) extraData.physicianPhone = physicianPhone;
      if (physicianAltPhone) extraData.physicianAltPhone = physicianAltPhone;
      const insProvider = getCell(row, R.insuranceProvider);
      const insProviderPhone = getCell(row, R.insuranceProviderPhone);
      const insHolderFirst = getCell(row, R.insurancePolicyHolderFirst);
      const insHolderLast = getCell(row, R.insurancePolicyHolderLast);
      const insPolicyNum = getCell(row, R.insurancePolicyNumber);
      if (insProvider) extraData.insuranceProvider = insProvider;
      if (insProviderPhone) extraData.insuranceProviderPhone = insProviderPhone;
      if (insHolderFirst) extraData.insurancePolicyHolderFirstName = insHolderFirst;
      if (insHolderLast) extraData.insurancePolicyHolderLastName = insHolderLast;
      if (insPolicyNum) extraData.insurancePolicyNumber = insPolicyNum;

      const pk = playerKey(firstName, lastName, dob);
      let player = playersByKey[pk];
      if (player) {
        let changed = false;
        if (gender && !player.gender) { player.gender = gender; changed = true; }
        if (phoneNumber && !player.phoneNumber) { player.phoneNumber = phoneNumber; changed = true; }
        if (address && !player.address) { player.address = address; changed = true; }
        if (city && !player.city) { player.city = city; changed = true; }
        if (state && !player.state) { player.state = state; changed = true; }
        if (zip && !player.zip) { player.zip = zip; changed = true; }
        if (playerEmail && !player.email) { player.email = playerEmail.toLowerCase(); changed = true; }
        if (previousId && !player.previousId) { player.previousId = previousId; changed = true; }
        if (school && !player.school) { player.school = school; changed = true; }
        if (Object.keys(extraData).length > 0 && (!player.extraData || Object.keys(player.extraData).length === 0)) {
          player.extraData = extraData;
          player.markModified("extraData");
          changed = true;
        }
        if (changed) {
          await dualSave(ctx, player);
          stats.players.updated++;
        }
      } else {
        player = await dualCreate(ctx, "Player", {
          clubId,
          firstName,
          lastName,
          dateOfBirth: dob,
          gender,
          phonePrefix: "+1",
          phoneNumber,
          address,
          city,
          state,
          zip,
          email: playerEmail ? playerEmail.toLowerCase() : "",
          previousId,
          school,
          extraData: Object.keys(extraData).length > 0 ? extraData : {},
          teams: [],
          parents: [],
        });
        playersByKey[pk] = player;
        stats.players.created++;
      }

      const g1First = getCell(row, R.g1FirstName);
      const g1Last = getCell(row, R.g1LastName);
      const g1Email = getCell(row, R.g1Email);
      const g1Phone = getCell(row, R.g1Phone);
      const g1AltPhone = getCell(row, R.g1AltPhone);
      const parent1 = await upsertParent(g1First, g1Last, g1Email, g1Phone, g1AltPhone, player, i);

      const g2First = getCell(row, R.g2FirstName);
      const g2Last = getCell(row, R.g2LastName);
      const g2Email = getCell(row, R.g2Email) || getCell(row, R.g2AltEmail);
      const g2Phone = getCell(row, R.g2Phone);
      const g2AltPhone = getCell(row, R.g2AltPhone);
      const parent2 = await upsertParent(g2First, g2Last, g2Email, g2Phone, g2AltPhone, player, i);

      const allergies = getCell(row, R.allergies);
      const medicalConditions = getCell(row, R.medicalConditions);
      const currentClub = getCell(row, R.currentClub);
      const currentTeam = getCell(row, R.currentTeam);

      const formData = {};
      if (allergies) formData.allergies = allergies;
      if (medicalConditions) formData.medical_conditions = medicalConditions;
      if (school) formData.school_attend = school;
      if (currentClub) formData.current_club = currentClub;
      if (currentTeam) formData.current_team = currentTeam;

      const existingOrder = await Order.findOne({ activityId: activity._id, playerId: player._id });
      if (!existingOrder) {
        await dualCreate(ctx, "Order", {
          activityId: activity._id,
          clubId,
          playerId: player._id,
          playerFirstName: firstName,
          playerLastName: lastName,
          playerDob: dob,
          playerGender: gender,
          playerPhonePrefix: "+1",
          playerPhone: phoneNumber,
          playerEmail: playerEmail ? playerEmail.toLowerCase() : "",
          parent1FirstName: parent1?.firstName || g1First || "",
          parent1LastName: parent1?.lastName || g1Last || "",
          parent1PhonePrefix: parent1?.phonePrefix || "+1",
          parent1Phone: normalizePhone(g1Phone),
          parent1Email: g1Email ? g1Email.toLowerCase() : "",
          parent2FirstName: parent2?.firstName || g2First || "",
          parent2LastName: parent2?.lastName || g2Last || "",
          parent2PhonePrefix: parent2?.phonePrefix || "+1",
          parent2Phone: normalizePhone(g2Phone),
          parent2Email: g2Email ? g2Email.toLowerCase() : "",
          teamId: null,
          status: "pending",
          formData,
          registrationCompletedAt: createdDate ? new Date(createdDate) : null,
        });
        stats.orders.created++;
      }
    } catch (rowErr) {
      errors.push(`Row ${i + 1}: ${rowErr.message}`);
    }
  }

  return {
    success: true,
    stats,
    activityId: activity._id.toString(),
    errors: errors.length > 0 ? errors : undefined,
  };
}

async function _POST(req, res) {
  try {
    const { ctx, error } = await getClubContext(req, res);
    if (error) return res.status(200).json(error.body, { status: error.status });
    const { Player, Parent, Team } = ctx.models;
    const clubId = ctx.clubId;

    const formData = req.body;
    const file = formData.get("file");
    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: false });

    if (rows.length < 2) {
      return res.status(400).json({ error: "File is empty or has no data rows" });
    }

    const headers = rows[0].map((h) => String(h).toLowerCase().trim());
    const uploadType = formData.get("uploadType") || "byga";

    if (uploadType === "rangers") {
      const result = await processRangersUpload(rows, headers, ctx);
      if (result.error) {
        return res.status(400).json({ error: result.error });
      }
      return res.status(200).json(result);
    }

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
      return res.status(400).json({ error: "Could not find player_first_name and player_last_name columns" });
    }

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
      const dob = toDobString(pl.dateOfBirth) || "";
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
        const dob = toDobString(getCell(row, C.dob));
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
            team = await dualCreate(ctx, "Team", {
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
            await dualSave(ctx, player);
            stats.players.updated++;
          }
        } else {
          const teams = team ? [{ teamId: team._id, season: season || "25/26" }] : [];
          player = await dualCreate(ctx, "Player", {
            clubId,
            firstName,
            lastName,
            dateOfBirth: dob,
            gender,
            primaryPosition,
            secondaryPosition,
            school,
            joinDate,
            phonePrefix: "+1",
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
              await dualSave(ctx, parent);
            }
            if (!player.parents.some((pid) => pid.toString() === parent._id.toString())) {
              player.parents.push(parent._id);
              await dualSave(ctx, player);
            }
            stats.parents.updated++;
          } else {
            try {
              parent = await dualCreate(ctx, "Parent", {
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
              await dualSave(ctx, player);
              stats.parents.created++;
            } catch (dupErr) {
              if (dupErr.code === 11000) {
                parent = await Parent.findOne({ clubId, email: contactEmail });
                if (parent) {
                  if (!parent.players.some((pid) => pid.toString() === player._id.toString())) {
                    parent.players.push(player._id);
                    await dualSave(ctx, parent);
                  }
                  if (!player.parents.some((pid) => pid.toString() === parent._id.toString())) {
                    player.parents.push(parent._id);
                    await dualSave(ctx, player);
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
              await dualSave(ctx, secParent);
            }
            if (!player.parents.some((pid) => pid.toString() === secParent._id.toString())) {
              player.parents.push(secParent._id);
              await dualSave(ctx, player);
            }
            stats.parents.updated++;
          } else {
            try {
              secParent = await dualCreate(ctx, "Parent", {
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
              await dualSave(ctx, player);
              stats.parents.created++;
            } catch (dupErr) {
              if (dupErr.code === 11000) {
                secParent = await Parent.findOne({ clubId, email: secEmail });
                if (secParent) {
                  if (!secParent.players.some((pid) => pid.toString() === player._id.toString())) {
                    secParent.players.push(player._id);
                    await dualSave(ctx, secParent);
                  }
                  if (!player.parents.some((pid) => pid.toString() === secParent._id.toString())) {
                    player.parents.push(secParent._id);
                    await dualSave(ctx, player);
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

    return res.status(200).json({
      success: true,
      stats,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Upload players CSV error:", error);
    return res.status(500).json({ error: "Failed to process file" });
  }
}
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  return _POST(req, res);
}
