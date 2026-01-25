// Entry point du CLI pour le projet MMORPG

import inquirer from 'inquirer';
import { generateEntity } from './templates/entity';
import { generateModule } from './templates/module';
import { generateService } from './templates/service';
import { generateController } from './templates/controller';
import { generateDTOs } from './templates/dtos';
import { generateSeed } from './templates/seed';
import {
  AnyField,
  ColumnField,
  RelationField,
  EntityOptions,
  RelationType,
} from './templates/types';

async function main() {
  console.log('\n=== NestJS Entity Generator (advanced, Symfony-style) ===\n');

  const { domain } = await inquirer.prompt([
    {
      type: 'input',
      name: 'domain',
      message: 'Domaine (ex: characters, monsters, items, quests) :',
      validate: (v) => v.trim() !== '' || 'Domaine requis',
    },
  ]);

  const { entityName } = await inquirer.prompt([
    {
      type: 'input',
      name: 'entityName',
      message: "Nom de l'entité :",
      validate: (v) => v.trim().length > 0 || 'Nom requis',
    },
  ]);

  const entityOptions = await askEntityOptions();

  const fields: AnyField[] = [];
  let addMore = true;

  while (addMore) {
    const { kind } = await inquirer.prompt([
      {
        type: 'list',
        name: 'kind',
        message: 'Type de champ :',
        choices: [
          { name: 'Colonne simple', value: 'column' },
          { name: 'Relation (ManyToOne, OneToMany, etc.)', value: 'relation' },
        ],
      },
    ]);

    if (kind === 'column') {
      const columnField = await askColumnField();
      fields.push(columnField);
    } else {
      const relationField = await askRelationField();
      fields.push(relationField);
    }

    const { again } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'again',
        message: 'Ajouter un autre champ ?',
        default: true, // (Y/n)
      },
    ]);
    addMore = again;
  }

  console.log('\nGénération des fichiers...\n');

  generateEntity(domain, entityName, fields, entityOptions);
  generateDTOs(domain, entityName, fields, entityOptions);
  generateService(domain, entityName);
  generateController(domain, entityName);
  generateModule(domain, entityName);
  generateSeed(domain, entityName, fields);

  console.log(`\nEntité ${entityName} générée dans src/${domain}\n`);
}

// Options globaux de l'entité (audit, soft delete)
async function askEntityOptions(): Promise<EntityOptions> {
  const answers = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'addCreatedAt',
      message: 'Ajouter createdAt ? (Y/n)',
      default: true,
    },
    {
      type: 'confirm',
      name: 'addUpdatedAt',
      message: 'Ajouter updatedAt ? (Y/n)',
      default: true,
    },
    {
      type: 'confirm',
      name: 'addDeletedAt',
      message: 'Ajouter deletedAt (soft delete) ? (y/N)',
      default: false,
    },
  ]);

  return answers as EntityOptions;
}

// Questions pour une colonne simple
async function askColumnField(): Promise<ColumnField> {
  const base = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Nom du champ :',
      validate: (v) => v.trim().length > 0 || 'Nom requis',
    },
    {
      type: 'list',
      name: 'primitiveType',
      message: 'Type :',
      choices: [
        'string',
        'number',
        'boolean',
        'date',
        'uuid',
        'enum',
        'json',
        'decimal',
      ],
      default: 'string',
    },
    {
      type: 'confirm',
      name: 'nullable',
      message: 'Nullable ? (Y/n)',
      default: false,
    },
    {
      type: 'confirm',
      name: 'unique',
      message: 'Unique ? (y/N)',
      default: false,
    },
    {
      type: 'confirm',
      name: 'isIndexed',
      message: 'Indexer ce champ ? (y/N)',
      default: false,
    },
  ]);

  let enumName: string | undefined;
  let enumValues: string[] | undefined;
  if (base.primitiveType === 'enum') {
    const enumAnswers = await inquirer.prompt([
      {
        type: 'input',
        name: 'enumName',
        message: "Nom de l'enum (ex: DragonElement) :",
        validate: (v) => v.trim().length > 0 || "Nom d'enum requis",
      },
      {
        type: 'input',
        name: 'enumValues',
        message:
          "Valeurs de l'enum (séparées par des virgules, ex: Fire,Water,Earth) :",
        validate: (v) => v.trim().length > 0 || 'Au moins une valeur',
      },
    ]);
    enumName = enumAnswers.enumName.trim();
    enumValues = enumAnswers.enumValues
      .split(',')
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 0);
  }

  let length: number | undefined;
  if (base.primitiveType === 'string') {
    const { length: len } = await inquirer.prompt([
      {
        type: 'input',
        name: 'length',
        message: 'Longueur (laisser vide pour défaut) :',
      },
    ]);
    length = len ? Number(len) : undefined;
  }

  let precision: number | undefined;
  let scale: number | undefined;
  if (base.primitiveType === 'decimal') {
    const res = await inquirer.prompt([
      {
        type: 'input',
        name: 'precision',
        message: 'Précision (ex: 10) :',
      },
      {
        type: 'input',
        name: 'scale',
        message: 'Scale (ex: 2) :',
      },
    ]);
    precision = res.precision ? Number(res.precision) : undefined;
    scale = res.scale ? Number(res.scale) : undefined;
  }

  const { defaultValue, comment } = await inquirer.prompt([
    {
      type: 'input',
      name: 'defaultValue',
      message: 'Valeur par défaut (laisser vide si aucune) :',
    },
    {
      type: 'input',
      name: 'comment',
      message: 'Commentaire (optionnel) :',
    },
  ]);

  const field: ColumnField = {
    kind: 'column',
    name: base.name.trim(),
    primitiveType: base.primitiveType,
    nullable: base.nullable,
    unique: base.unique,
    isIndexed: base.isIndexed,
    defaultValue: defaultValue !== '' ? defaultValue : undefined,
    comment: comment || undefined,
    enumName,
    enumValues,
    length,
    precision,
    scale,
  };

  return field;
}

// Questions pour une relation
async function askRelationField(): Promise<RelationField> {
  const base = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Nom du champ de relation (ex: owner, items, dragons) :',
      validate: (v) => v.trim().length > 0 || 'Nom requis',
    },
    {
      type: 'list',
      name: 'relationType',
      message: 'Type de relation :',
      choices: [
        { name: 'ManyToOne', value: 'many-to-one' },
        { name: 'OneToMany', value: 'one-to-many' },
        { name: 'ManyToMany', value: 'many-to-many' },
        { name: 'OneToOne', value: 'one-to-one' },
      ],
    },
    {
      type: 'input',
      name: 'targetEntity',
      message: 'Entité cible (nom de classe, ex: Character, Item, Dragon) :',
      validate: (v) => v.trim().length > 0 || 'Entité cible requise',
    },
    {
      type: 'confirm',
      name: 'nullable',
      message: 'Nullable ? (Y/n)',
      default: true,
    },
    {
      type: 'confirm',
      name: 'cascade',
      message: 'Cascade ? (y/N)',
      default: false,
    },
    {
      type: 'confirm',
      name: 'eager',
      message: 'Eager loading ? (y/N)',
      default: false,
    },
  ]);

  let inverseSide: string | undefined;
  let ownerSide: boolean | undefined;
  let joinColumnName: string | undefined;
  let joinTableName: string | undefined;
  let joinColumn: string | undefined;
  let inverseJoinColumn: string | undefined;

  if (base.relationType === 'one-to-many') {
    const { inv } = await inquirer.prompt([
      {
        type: 'input',
        name: 'inv',
        message: 'Nom du champ inverse côté cible (mappedBy, ex: owner) :',
      },
    ]);
    inverseSide = inv || undefined;
  }

  if (base.relationType === 'many-to-one') {
    const { joinCol } = await inquirer.prompt([
      {
        type: 'input',
        name: 'joinCol',
        message: 'Nom de la joinColumn (laisser vide pour défaut) :',
      },
    ]);
    joinColumnName = joinCol || undefined;
  }

  if (base.relationType === 'many-to-many') {
    const res = await inquirer.prompt([
      {
        type: 'input',
        name: 'joinTableName',
        message: 'Nom de la joinTable (laisser vide pour défaut) :',
      },
      {
        type: 'input',
        name: 'joinColumn',
        message: 'Nom de la joinColumn (laisser vide pour défaut) :',
      },
      {
        type: 'input',
        name: 'inverseJoinColumn',
        message: "Nom de l'inverseJoinColumn (laisser vide pour défaut) :",
      },
    ]);
    joinTableName = res.joinTableName || undefined;
    joinColumn = res.joinColumn || undefined;
    inverseJoinColumn = res.inverseJoinColumn || undefined;
  }

  if (base.relationType === 'one-to-one') {
    const res = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'ownerSide',
        message: 'Cette entité est-elle le côté owner ? (Y/n)',
        default: true,
      },
      {
        type: 'input',
        name: 'joinColumnName',
        message: 'Nom de la joinColumn (laisser vide pour défaut) :',
      },
    ]);
    ownerSide = res.ownerSide;
    joinColumnName = res.joinColumnName || undefined;
  }

  const field: RelationField = {
    kind: 'relation',
    name: base.name.trim(),
    nullable: base.nullable,
    unique: false,
    isIndexed: false,
    relationType: base.relationType as RelationType,
    targetEntity: base.targetEntity.trim(),
    inverseSide,
    ownerSide,
    cascade: base.cascade,
    eager: base.eager,
    joinColumnName,
    joinTableName,
    joinColumn,
    inverseJoinColumn,
  };

  return field;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
