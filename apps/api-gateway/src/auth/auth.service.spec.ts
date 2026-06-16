import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import {
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UserService } from '../users/user.service';
import { User, UserRole } from '../users/entities/user.entity';

describe('AuthService', () => {
  let service: AuthService;
  let userRepository: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let userService: { findOne: jest.Mock };
  let jwtService: { sign: jest.Mock };

  beforeEach(async () => {
    userRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    userService = { findOne: jest.fn() };
    jwtService = { sign: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UserService, useValue: userService },
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('register', () => {
    it("rejette l'inscription si le nom d'utilisateur existe déjà", async () => {
      userRepository.findOne.mockResolvedValue({ id: 'existing' });

      await expect(service.register('semoa', 'password')).rejects.toThrow(
        ConflictException,
      );
      expect(userRepository.save).not.toHaveBeenCalled();
    });

    it('hash le mot de passe et sauvegarde le nouvel utilisateur', async () => {
      userRepository.findOne.mockResolvedValue(null);
      userRepository.create.mockImplementation((dto: unknown) => dto);
      userRepository.save.mockImplementation((user: unknown) =>
        Promise.resolve(user),
      );

      const result = await service.register('semoa', 'password');

      expect(userRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ username: 'semoa', isActive: true }),
      );
      expect(result.password).not.toBe('password');
      expect(await bcrypt.compare('password', result.password)).toBe(true);
    });
  });

  describe('login', () => {
    const baseUser = {
      id: 'user-1',
      username: 'semoa',
      isActive: true,
      role: UserRole.PLAYER,
    };

    it("rejette si l'utilisateur n'existe pas", async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(service.login('semoa', 'password')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejette si le compte est désactivé', async () => {
      userRepository.findOne.mockResolvedValue({
        ...baseUser,
        isActive: false,
      });

      await expect(service.login('semoa', 'password')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejette si le mot de passe est incorrect', async () => {
      const password = await bcrypt.hash('correct-password', 10);
      userRepository.findOne.mockResolvedValue({ ...baseUser, password });

      await expect(service.login('semoa', 'wrong-password')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('retourne un access_token si les identifiants sont valides', async () => {
      const password = await bcrypt.hash('correct-password', 10);
      userRepository.findOne.mockResolvedValue({ ...baseUser, password });
      jwtService.sign.mockReturnValue('signed-jwt');

      const result = await service.login('semoa', 'correct-password');

      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: baseUser.id,
        username: baseUser.username,
        role: baseUser.role,
      });
      expect(result).toEqual({ access_token: 'signed-jwt' });
    });
  });

  describe('validateUser', () => {
    it("retourne l'utilisateur s'il est trouvé", async () => {
      userService.findOne.mockResolvedValue({ id: 'user-1' });

      await expect(service.validateUser('user-1')).resolves.toEqual({
        id: 'user-1',
      });
    });

    it("retourne null si l'utilisateur n'est pas trouvé", async () => {
      userService.findOne.mockRejectedValue(new NotFoundException());

      await expect(service.validateUser('missing')).resolves.toBeNull();
    });
  });
});
