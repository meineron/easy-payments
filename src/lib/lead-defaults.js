export function defaultLeadFormSections() {
  return [
    {
      key: "contact",
      title: "Contact",
      order: 0,
      isDefault: true,
      fields: [
        {
          key: "lead_firstName",
          type: "input",
          label: "First Name",
          description: "",
          required: true,
          hidden: false,
          isDefault: true,
          isMust: false,
          options: [],
          order: 0,
        },
        {
          key: "lead_lastName",
          type: "input",
          label: "Last Name",
          description: "",
          required: true,
          hidden: false,
          isDefault: true,
          isMust: false,
          options: [],
          order: 1,
        },
        {
          key: "lead_email",
          type: "email",
          label: "Email",
          description: "",
          required: true,
          hidden: false,
          isDefault: true,
          isMust: true,
          options: [],
          order: 2,
        },
        {
          key: "lead_phone",
          type: "phone",
          label: "Phone",
          description: "",
          required: true,
          hidden: false,
          isDefault: true,
          isMust: true,
          options: [],
          order: 3,
        },
      ],
    },
  ];
}

export function ensureMustFields(formSections) {
  const sections = JSON.parse(JSON.stringify(formSections || []));
  if (sections.length === 0) {
    return defaultLeadFormSections();
  }

  const allFields = sections.flatMap((s) => s.fields || []);
  const hasEmail = allFields.some((f) => f.key === "lead_email" || (f.isMust && f.type === "email"));
  const hasPhone = allFields.some((f) => f.key === "lead_phone" || (f.isMust && f.type === "phone"));

  if (!hasEmail || !hasPhone) {
    const first = sections[0];
    first.fields = first.fields || [];
    if (!hasEmail) {
      first.fields.push({
        key: "lead_email",
        type: "email",
        label: "Email",
        description: "",
        required: true,
        hidden: false,
        isDefault: true,
        isMust: true,
        options: [],
        order: first.fields.length,
      });
    }
    if (!hasPhone) {
      first.fields.push({
        key: "lead_phone",
        type: "phone",
        label: "Phone",
        description: "",
        required: true,
        hidden: false,
        isDefault: true,
        isMust: true,
        options: [],
        order: first.fields.length,
      });
    }
  }

  return sections;
}
