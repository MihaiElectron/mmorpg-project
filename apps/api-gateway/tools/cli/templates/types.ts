// Types communs utilisés par tous les templates du générateur

export type PrimitiveType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'uuid'
  | 'enum'
  | 'json'
  | 'decimal';

export type RelationType =
  | 'many-to-one'
  | 'one-to-many'
  | 'many-to-many'
  | 'one-to-one';

export type FieldKind = 'column' | 'relation';

export interface BaseField {
  kind: FieldKind;
  name: string;
  nullable: boolean;
  unique: boolean;
  isIndexed?: boolean;
  defaultValue?: string | number | boolean | null;
  comment?: string;
  primitiveType?: PrimitiveType;
  // enumName est utilisé si primitiveType === "enum"
  enumName?: string;
  enumValues?: string[];
  length?: number;
  precision?: number;
  scale?: number;
}

export interface RelationField extends BaseField {
  kind: 'relation';
  relationType: RelationType;
  targetEntity: string; // nom de l'entité cible (className)
  inverseSide?: string; // ex: "dragons"
  ownerSide?: boolean; // pour one-to-one
  cascade?: boolean;
  eager?: boolean;
  joinColumnName?: string;
  joinTableName?: string;
  joinColumn?: string;
  inverseJoinColumn?: string;
}

export interface ColumnField extends BaseField {
  kind: 'column';
}

export type AnyField = ColumnField | RelationField;

export interface EntityOptions {
  addCreatedAt: boolean;
  addUpdatedAt: boolean;
  addDeletedAt: boolean; // soft delete
}
