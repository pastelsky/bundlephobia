import React, {Component} from 'react';
import SimilarPackageCard from "client/components/SimilarPackageCard/SimilarPackageCard";
import stylesheet from './SimilarPackagesSection.scss'

class SimilarPackagesSection extends Component {
  render() {
    const { packs, category, comparisonGzip } = this.props
    return (
      <div className="similar-packages-section">
        <h2 className="similar-packages-section__heading"> Similar Packages </h2>
        <h5 className="similar-packages-section__subheading"> {category} </h5>

        <style dangerouslySetInnerHTML={{ __html: stylesheet }}/>

        <div className="similar-packages-section__list">
          {packs.map(pack => (
            <SimilarPackageCard
              key={pack.name}
              pack={pack}
              comparisonSizePercent={(pack.gzip - comparisonGzip) / comparisonGzip * 100}
            />
          ))}
          <SimilarPackageCard isEmpty/>
        </div>
      </div>
    );
  }
}

export default SimilarPackagesSection;