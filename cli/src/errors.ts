/** An error whose message is safe to show to the user. Never holds secrets. */
export class CliError extends Error {
  constructor(
    message: string,
    public exitCode = 1,
  ) {
    super(message);
    this.name = "CliError";
  }
}
