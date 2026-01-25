// Template de génération de service sécurisé

import fs from 'fs';
import path from 'path';

export function generateService(domain: string, name: string) {
  const className = capitalize(name);

  const content = `
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ${className} } from './entities/${name}.entity';
import { Create${className}Dto } from './dto/create-${name}.dto';
import { Update${className}Dto } from './dto/update-${name}.dto';

@Injectable()
export class ${className}Service {
  constructor(
    @InjectRepository(${className})
    private readonly repo: Repository<${className}>,
  ) {}

  async create(dto: Create${className}Dto): Promise<${className}> {
    const entity = this.repo.create(dto as any);
    return this.repo.save(entity);
  }

  async findAll(): Promise<${className}[]> {
    return this.repo.find();
  }

  async findOne(id: string): Promise<${className}> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) {
      throw new NotFoundException(\`${className} \${id} not found\`);
    }
    return entity;
  }

  async update(id: string, dto: Update${className}Dto): Promise<${className}> {
    const entity = await this.findOne(id);
    Object.assign(entity, dto);
    return this.repo.save(entity);
  }

  async remove(id: string): Promise<void> {
    const entity = await this.findOne(id);
    await this.repo.remove(entity);
  }
}
`;

  const filePath = path.join('src', domain, `${name}.service.ts`);
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content.trimStart());
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
