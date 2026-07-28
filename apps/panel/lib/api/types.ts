import type { FetchOptions, ResponseType } from "ofetch";

export type NextFetchConfig = {
  revalidate?: number | false;
  tags?: string[];
};

export type ApiFetchOptions<R extends ResponseType = "json"> = Omit<
  FetchOptions<R>,
  "body"
> & {
  body?: FetchOptions<R>["body"];
  next?: NextFetchConfig;
};
