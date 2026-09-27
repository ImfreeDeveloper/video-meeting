import { IsNotEmpty, IsString, MinLength } from 'class-validator';

/** Mirrors `auth/dto/register.dto.ts` — the two must not disagree on what
 * counts as an acceptable password. */
export const PASSWORD_MIN_LENGTH = 6;

export class ChangePasswordDto {
  /**
   * Only checked for being a non-empty string here: how long it has to be was
   * decided when it was set, and re-validating it would turn "wrong password"
   * into a validation error.
   */
  @IsString()
  @IsNotEmpty()
  oldPassword: string;

  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  newPassword: string;
}
