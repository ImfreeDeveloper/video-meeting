export class UploadMeetingFileCommand {
  constructor(
    public readonly ownerId: string,
    public readonly meetingId: string,
    public readonly file: Express.Multer.File,
  ) {}
}
