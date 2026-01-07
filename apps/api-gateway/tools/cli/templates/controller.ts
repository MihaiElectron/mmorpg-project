// Template de génération de controller sécurisé

import fs from "fs";
import path from "path";

export function generateController(domain: string, name: string) {
  const className = capitalize(name);
  const route = name.toLowerCase();

  const content = `
import { Controller, Get, Post, Body, Param, Patch, Delete } from '@nestjs/common';
import { ${className}Service } from './${name}.service';
import { Create${className}Dto } from './dto/create-${name}.dto';
import { Update${className}Dto } from './dto/update-${name}.dto';

@Controller('${route}')
export class ${className}Controller {
  constructor(private readonly service: ${className}Service) {}

  @Post()
  create(@Body() dto: Create${className}Dto) {
    return this.service.create(dto);
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Update${className}Dto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
`;

  const filePath = path.join("src", domain, `${name}.controller.ts`);
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content.trimStart());
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
