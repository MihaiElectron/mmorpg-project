// Template de génération des DTOs avancés, sécurisé contre les conflits de noms

import fs from "fs";
import path from "path";
import { AnyField, ColumnField, RelationField, EntityOptions } from "./types";

export function generateDTOs(
  domain: string,
  name: string,
  fields: AnyField[],
  _options: EntityOptions,
) {
  const className = capitalize(name);
  const dtoDir = path.join("src", domain, "dto");
  ensureDir(dtoDir);

  const { columnFields, relationFields } = splitFields(fields);

  const imports = buildDtoImports(columnFields, relationFields, domain);

  const createFieldsCode = [
    ...columnFields.map((f) => buildCreateColumnDtoField(f)),
    ...relationFields.map((f) => buildCreateRelationDtoField(f)),
  ].join("\n");

  const updateFieldsCode = [
    ...columnFields.map((f) => buildUpdateColumnDtoField(f)),
    ...relationFields.map((f) => buildUpdateRelationDtoField(f)),
  ].join("\n");

  const createDTO = `
${imports}

export class Create${className}Dto {
${createFieldsCode}
}
`;

  const updateDTO = `
${imports}

export class Update${className}Dto {
${updateFieldsCode}
}
`;

  fs.writeFileSync(
    path.join(dtoDir, `create-${name}.dto.ts`),
    createDTO.trimStart(),
  );
  fs.writeFileSync(
    path.join(dtoDir, `update-${name}.dto.ts`),
    updateDTO.trimStart(),
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

function buildDtoImports(
  columnFields: ColumnField[],
  relationFields: RelationField[],
  domain: string,
): string {
  const validators = new Set<string>();
  const transformers = new Set<string>();
  const extraImports = new Set<string>();

  validators.add("IsOptional");

  for (const col of columnFields) {
    switch (col.primitiveType) {
      case "string":
        validators.add("IsString");
        break;
      case "number":
      case "decimal":
        validators.add("IsNumber");
        break;
      case "boolean":
        validators.add("IsBoolean");
        break;
      case "date":
        validators.add("IsDate");
        transformers.add("Type");
        break;
      case "uuid":
        validators.add("IsUUID");
        break;
      case "enum":
        validators.add("IsEnum");
        if (col.enumName) {
          extraImports.add(
            `import { ${col.enumName} } from '../enums/${toKebabCase(col.enumName)}.enum';`,
          );
        }
        break;
    }
  }

  for (const rel of relationFields) {
    switch (rel.relationType) {
      case "many-to-one":
      case "one-to-one":
        validators.add("IsUUID");
        break;
      case "many-to-many":
      case "one-to-many":
        validators.add("IsArray");
        validators.add("IsUUID");
        break;
    }
  }

  const validatorImport = `import { ${Array.from(validators).sort().join(
    ", ",
  )} } from 'class-validator';`;
  const transformerImport =
    transformers.size > 0
      ? `import { ${Array.from(transformers).sort().join(
          ", ",
        )} } from 'class-transformer';`
      : "";

  const extra = Array.from(extraImports).join("\n");

  return [validatorImport, transformerImport, extra]
    .filter((s) => s.trim().length > 0)
    .join("\n");
}

function buildCreateColumnDtoField(field: ColumnField): string {
  const lines: string[] = [];

  switch (field.primitiveType) {
    case "string":
      lines.push("  @IsString()");
      break;
    case "number":
    case "decimal":
      lines.push("  @IsNumber()");
      break;
    case "boolean":
      lines.push("  @IsBoolean()");
      break;
    case "date":
      lines.push("  @IsDate()");
      lines.push("  @Type(() => Date)");
      break;
    case "uuid":
      lines.push("  @IsUUID()");
      break;
    case "enum":
      if (field.enumName) lines.push(`  @IsEnum(${field.enumName})`);
      break;
  }

  if (field.nullable) lines.push("  @IsOptional()");

  lines.push(`  ${field.name}: ${mapDtoTsType(field)};`);

  return "\n" + lines.join("\n");
}

function buildUpdateColumnDtoField(field: ColumnField): string {
  const lines: string[] = [];

  lines.push("  @IsOptional()");

  switch (field.primitiveType) {
    case "string":
      lines.push("  @IsString()");
      break;
    case "number":
    case "decimal":
      lines.push("  @IsNumber()");
      break;
    case "boolean":
      lines.push("  @IsBoolean()");
      break;
    case "date":
      lines.push("  @IsDate()");
      lines.push("  @Type(() => Date)");
      break;
    case "uuid":
      lines.push("  @IsUUID()");
      break;
    case "enum":
      if (field.enumName) lines.push(`  @IsEnum(${field.enumName})`);
      break;
  }

  lines.push(`  ${field.name}?: ${mapDtoTsType(field)};`);

  return "\n" + lines.join("\n");
}

function buildCreateRelationDtoField(field: RelationField): string {
  const lines: string[] = [];
  const targetIdName =
    field.relationType === "many-to-one" ||
    field.relationType === "one-to-one"
      ? `${field.name}Id`
      : `${field.name}Ids`;

  switch (field.relationType) {
    case "many-to-one":
    case "one-to-one":
      lines.push("  @IsUUID()");
      if (field.nullable) lines.push("  @IsOptional()");
      lines.push(`  ${targetIdName}: string;`);
      break;

    case "many-to-many":
    case "one-to-many":
      lines.push("  @IsArray()");
      lines.push('  @IsUUID("all", { each: true })');
      if (field.nullable) lines.push("  @IsOptional()");
      lines.push(`  ${targetIdName}: string[];`);
      break;
  }

  return "\n" + lines.join("\n");
}

function buildUpdateRelationDtoField(field: RelationField): string {
  const lines: string[] = [];
  const targetIdName =
    field.relationType === "many-to-one" ||
    field.relationType === "one-to-one"
      ? `${field.name}Id`
      : `${field.name}Ids`;

  lines.push("  @IsOptional()");

  switch (field.relationType) {
    case "many-to-one":
    case "one-to-one":
      lines.push("  @IsUUID()");
      lines.push(`  ${targetIdName}?: string;`);
      break;

    case "many-to-many":
    case "one-to-many":
      lines.push("  @IsArray()");
      lines.push('  @IsUUID("all", { each: true })');
      lines.push(`  ${targetIdName}?: string[];`);
      break;
  }

  return "\n" + lines.join("\n");
}

function mapDtoTsType(field: ColumnField): string {
  switch (field.primitiveType) {
    case "string":
    case "uuid":
    case "json":
      return "string";
    case "number":
    case "decimal":
      return "number";
    case "boolean":
      return "boolean";
    case "date":
      return "Date";
    case "enum":
      return field.enumName || "string";
    default:
      return "string";
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function toKebabCase(s: string): string {
  return s
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase();
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
