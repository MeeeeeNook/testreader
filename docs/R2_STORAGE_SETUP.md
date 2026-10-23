# R2 storage for IELTS Studio

Firebase continues to provide Authentication and Firestore. R2 stores newly uploaded audio and images. Existing Firebase URLs continue to work; nothing is deleted or migrated automatically.

## Account setup

1. Use an existing Cloudflare account with R2 enabled. This change does not enable billing or purchase a plan. If Cloudflare requests payment details or acceptance of new terms, the owner must complete that step.
2. Create a dedicated Standard R2 bucket, for example `ielts-media`. Do not use Infrequent Access for the free Standard allowance.
3. Connect a public read-only custom domain to this media-only bucket. Do not put transcripts, answer keys or credentials in it. The `r2.dev` endpoint is intended for development and is rate limited.
4. Create an R2 S3 API token scoped to Object Read & Write for this bucket only. Keep both keys in Vercel server environment variables, never `VITE_*` variables or source control.
5. Add these variables to the existing Vercel project, then redeploy:

| Variable | Value |
| --- | --- |
| R2_ACCOUNT_ID | Cloudflare account ID |
| R2_ACCESS_KEY_ID | Bucket-scoped S3 access key ID |
| R2_SECRET_ACCESS_KEY | Bucket-scoped S3 secret key |
| R2_BUCKET_NAME | Exact bucket name |
| R2_PUBLIC_BASE_URL | Public HTTPS domain, without trailing object path |

## Bucket CORS

Apply the following policy for production. Add a specific preview URL only when needed; do not enable anonymous writes.

```json
[
  {
    "AllowedOrigins": ["https://ielts.vungocmanhcuong.id.vn"],
    "AllowedMethods": ["GET", "HEAD", "PUT"],
    "AllowedHeaders": ["Content-Type", "Range"],
    "ExposeHeaders": ["ETag", "Content-Length", "Content-Range", "Accept-Ranges"],
    "MaxAgeSeconds": 3600
  }
]
```

A PUT requires an expiring server-signed URL issued only after administrator authentication. CORS does not grant write authorization. Media travels directly from the browser to R2, outside the Vercel request body and bandwidth path. Downloads use the public R2 domain, including Range requests for seeking and CORS access for audio ZIP exports.

## Verify

1. Open Admin > Upload & Import > Check storage connection. It should report Cloudflare R2.
2. Upload one Listening ZIP. Verify compression progress, transfer progress, and the saved test.
3. In guest practice, verify playback, changing parts without resetting audio, seeking, and audio ZIP download.
4. Upload the same recording again: the R2 object is reused by its SHA-256 rather than stored twice.
5. Check R2 usage before importing the rest in smaller batches.

Official references:
- https://developers.cloudflare.com/r2/api/s3/presigned-urls/
- https://developers.cloudflare.com/r2/buckets/cors/
- https://developers.cloudflare.com/r2/pricing/

## Existing Firebase timeout

`storage/retry-limit-exceeded` means an operation timed out. It does not prove the source ZIP is invalid. Check Storage initialization, exact bucket name, billing requirements, Storage rules, App Check, browser CORS errors, and network reachability. The admin storage check distinguishes a missing bucket or denied server access where possible. Do not loosen Storage rules to allow anonymous uploads.
