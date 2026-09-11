export class GetMeetingQuery {
  constructor(
    public readonly ownerId: string,
    public readonly id: string,
  ) {}
}
