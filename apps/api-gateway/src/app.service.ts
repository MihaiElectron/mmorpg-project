// Service applicatif de base. Servez-vous de cette classe pour exposer la
// logique métier consommée par les contrôleurs du module racine.
import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }
}
