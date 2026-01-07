// Template de génération d'entité avancée, sécurisé contre les conflits de noms

import fs from "fs";
import path from "path";
import { AnyField, ColumnField, RelationField, EntityOptions } from "./types";

export function generateEntity(
  domain: string,
  name: string,
  fields: AnyField[],
  options: EntityOptions,
) {
  const className = capitalize(name);

  const { columnFields, relationFields } = splitFields(fields);

  const imports = buildImports(columnFields, relationFields, options);

  const columnsCode = columnFields.map(buildColumnCode).join("\n");
  const relationsCode = relationFields.map(buildRelationCode).join("\n");
  const auditCode = buildAuditCode(options);

  const content = `
${imports}

@Entity()
export class ${className} {
  @PrimaryGeneratedColumn('uuid')
  id: string;
${columnsCode}
${relationsCode}
${auditCode}
}
`;

  const filePath = path.join("src", domain, "entities", `${name}.entity.ts`);
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content.trimStart());
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

function buildImports(
  columnFields: ColumnField[],
  relationFields: RelationField[],
  options: EntityOptions,
): string {
  const typeormImports = new Set<string>([
    "Entity",
    "PrimaryGeneratedColumn",
    "Column",
  ]);

  if (options.addCreatedAt) typeormImports.add("CreateDateColumn");
  if (options.addUpdatedAt) typeormImports.add("UpdateDateColumn");
  if (options.addDeletedAt) typeormImports.add("DeleteDateColumn");

  for (const rel of relationFields) {
    switch (rel.relationType) {
      case "many-to-one":
        typeormImports.add("ManyToOne");
        typeormImports.add("JoinColumn");
        break;
      case "one-to-many":
        typeormImports.add("OneToMany");
        break;
      case "many-to-many":
        typeormImports.add("ManyToMany");
        typeormImports.add("JoinTable");
        break;
      case "one-to-one":
        typeormImports.add("OneToOne");
        typeormImports.add("JoinColumn");
        break;
    }
  }

  const enumImports = columnFields
    .filter((c) => c.primitiveType === "enum" && c.enumName)
    .map(
      (c) =>
        `import { ${c.enumName} } from '../enums/${toKebabCase(
          c.enumName!,
        )}.enum';`,
    )
    .join("\n");

  const typeormImportLine = `import { ${Array.from(typeormImports)
    .sort()
    .join(", ")} } from 'typeorm';`;

  return [typeormImportLine, enumImports].filter(Boolean).join("\n");
}

function buildColumnCode(field: ColumnField): string {
  const opts: string[] = [];

  if (field.primitiveType === "enum" && field.enumName) {
    opts.push(`type: 'enum'`);
    opts.push(`enum: ${field.enumName}`);
  }

  if (field.nullable) opts.push("nullable: true");
  if (field.unique) opts.push("unique: true");
  if (field.length) opts.push(`length: ${field.length}`);
  if (field.precision) opts.push(`precision: ${field.precision}`);
  if (field.scale) opts.push(`scale: ${field.scale}`);

  const optionsCode = opts.length ? `{ ${opts.join(", ")} }` : "";

  return `
  @Column(${optionsCode})
  ${field.name}: ${mapTsType(field)};`;
}

function buildRelationCode(field: RelationField): string {
  const opts: string[] = [];

  if (field.cascade) opts.push("cascade: true");
  if (field.eager) opts.push("eager: true");
  if (field.nullable) opts.push("nullable: true");

  const optionsCode = opts.length ? `, { ${opts.join(", ")} }` : "";

  const target = field.targetEntity;

  switch (field.relationType) {
    case "many-to-one":
      return `
  @ManyToOne(() => ${target}${optionsCode})
  @JoinColumn()
  ${field.name}: ${target};`;

    case "one-to-many":
      return `
  @OneToMany(() => ${target}, (x) => x.${field.inverseSide})
  ${field.name}: ${target}[];`;

    case "many-to-many":
      return `
  @ManyToMany(() => ${target}${optionsCode})
  @JoinTable()
  ${field.name}: ${target}[];`;

    case "one-to-one":
      return `
  @OneToOne(() => ${target}${optionsCode})
  @JoinColumn()
  ${field.name}: ${target};`;
  }
}

function buildAuditCode(options: EntityOptions): string {
  const lines: string[] = [];

  if (options.addCreatedAt) {
    lines.push(`  @CreateDateColumn()`);
    lines.push(`  createdAt: Date;`);
  }
  if (options.addUpdatedAt) {
    lines.push(`  @UpdateDateColumn()`);
    lines.push(`  updatedAt: Date;`);
  }
  if (options.addDeletedAt) {
    lines.push(`  @DeleteDateColumn()`);
    lines.push(`  deletedAt: Date | null;`);
  }

  return lines.length ? "\n" + lines.join("\n") : "";
}

function mapTsType(field: ColumnField): string {
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
