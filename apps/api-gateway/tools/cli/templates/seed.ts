// Template de génération de seed sécurisé

import fs from "fs";
import path from "path";
import { AnyField, ColumnField, RelationField } from "./types";

export function generateSeed(
  domain: string,
  name: string,
  fields: AnyField[],
) {
  const seedDir = path.join("src", domain, "seeds");
  ensureDir(seedDir);

  const { columnFields, relationFields } = splitFields(fields);

  const defaultObjectLines: string[] = [];

  for (const col of columnFields) {
    const v = buildSeedDefaultValue(col);
    defaultObjectLines.push(`    ${col.name}: ${v},`);
  }

  for (const rel of relationFields) {
    const v = buildSeedRelationValue(rel);
    defaultObjectLines.push(`    // ${rel.name}: ${v},`);
  }

  const className = capitalize(name);

  const content = `
export const ${className}Seed = [
  {
${defaultObjectLines.join("\n")}
  },
];
`;

  fs.writeFileSync(
    path.join(seedDir, `${name}.seed.ts`),
    content.trimStart(),
  );
}

function splitFields(fields: AnyField[]) {
  const columnFields: ColumnField[] = [];
  const relationFields: RelationField[] = [];

  for (const f of fields) {
    if (f.kind === "column") columnFields.push(f);
    else relationFields.push(f);
  }

  return { columnFields, relationFields };
}

function buildSeedDefaultValue(field: ColumnField): string {
  switch (field.primitiveType) {
    case "string":
    case "uuid":
    case "json":
      return "null";
    case "number":
    case "decimal":
      return "0";
    case "boolean":
      return "false";
    case "date":
      return "new Date()";
    case "enum":
      if (field.enumName && field.enumValues && field.enumValues.length > 0) {
        return `${field.enumName}.${field.enumValues[0]}`;
      }
      return "null";
    default:
      return "null";
  }
}

function buildSeedRelationValue(field: RelationField): string {
  switch (field.relationType) {
    case "many-to-one":
    case "one-to-one":
      return "'<uuid>'";
    case "many-to-many":
    case "one-to-many":
      return "['<uuid1>', '<uuid2>']";
    default:
      return "null";
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
