import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserRole } from '@app/contracts';
import { User } from './user.entity';

export interface GoogleProfileData {
  googleId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private readonly repo: Repository<User>) {}

  findById(id: string): Promise<User | null> {
    return this.repo.findOne({ where: { id } });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.repo.findOne({ where: { email } });
  }

  create(data: Partial<User>): Promise<User> {
    return this.repo.save(this.repo.create(data));
  }

  save(user: User): Promise<User> {
    return this.repo.save(user);
  }

  /**
   * Login con Google: busca por googleId; si no existe pero hay un usuario
   * local con el mismo email, vincula la cuenta; si no, lo crea.
   */
  async upsertFromGoogle(profile: GoogleProfileData): Promise<User> {
    let user = await this.repo.findOne({ where: { googleId: profile.googleId } });
    if (!user) {
      user = await this.findByEmail(profile.email);
      if (user) {
        user.googleId = profile.googleId;
      } else {
        user = this.repo.create({
          email: profile.email,
          name: profile.name,
          googleId: profile.googleId,
          role: UserRole.USER,
        });
      }
    }
    user.avatarUrl = profile.avatarUrl;
    return this.repo.save(user);
  }
}
