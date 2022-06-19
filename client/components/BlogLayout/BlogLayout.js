import ResultLayout from '../ResultLayout'
import './BlogLayout.scss'

const BlogLayout = ({ className, children }) => {
  return (
    <ResultLayout className={className}>
      <div className="blog-layout__container">{children}</div>
    </ResultLayout>
  )
}

export default BlogLayout
