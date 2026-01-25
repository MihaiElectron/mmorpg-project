// module.ts

import fs from 'fs';
import path from 'path';

export function generateModule(domain: string, name: string) {
  const className = capitalize(name);

  const content = `
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ${className} } from './entities/${name}.entity';
import { ${className}Service } from './${name}.service';
import { ${className}Controller } from './${name}.controller';

@Module({
  imports: [TypeOrmModule.forFeature([${className}])],
  controllers: [${className}Controller],
  providers: [${className}Service],
  exports: [${className}Service],
})
export class ${className}Module {}
`;

  const filePath = path.join('src', domain, `${name}.module.ts`);
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content.trimStart());
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
