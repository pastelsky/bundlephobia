import {
  ContentfulClient,
  ContentfulProvider as ContentfulProviderOriginal,
} from 'react-contentful'

const contentfulClient = new ContentfulClient({
  accessToken:
    process.env.NODE_ENV === 'production'
      ? 'mTlrTPvam3pHJYiOQyFAjKp2rxIBRo1qelSJPrSQUPE'
      : 'MvUlRvc3rMnq7CXCBPxiXSUstNscsq9XH8kMANcxoY8',
  host:
    process.env.NODE_ENV === 'production'
      ? 'cdn.contentful.com'
      : 'preview.contentful.com',
  space: '9cnlte662r2w',
})

const ContentfulProvider = ({ children }) => (
  <ContentfulProviderOriginal client={contentfulClient}>
    {children}
  </ContentfulProviderOriginal>
)

export default ContentfulProvider
