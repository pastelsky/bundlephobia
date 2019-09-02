import React, { PureComponent } from 'react';
import API from 'client/api';
import AutoComplete from 'react-autocomplete';
import cx from 'classnames';
import './AutocompleteInput.scss';
import debounce from 'debounce';

import { parsePackageString, parseComparedPackageString, getComparisonCount, isComparingPackages } from 'utils/common.utils';

export default class AutocompleteInput extends PureComponent {
	static defaultProps = {
		initialValue: ''
	};

	state = {
		value: this.props.initialValue,
		suggestions: [],
		isMenuVisible: false
	};

	getSuggestions = debounce(value => {
		if (isComparingPackages(value)) {
			const lastSearchedValue = this.getLastSearchedValue(value);
			if (!lastSearchedValue) return;
			API.getSuggestions(lastSearchedValue).then(result => {
				this.setState({ suggestions: result });
			});
		} else {
			API.getSuggestions(value).then(result => {
				this.setState({ suggestions: result });
			});
		}
	}, 150);

	hasCompared(item) {
		var packageName = new RegExp(`\\b${item.package.name}\\b`, 'g');
		return this.state.value.match(packageName);
	}

	getLastSearchedValue(value) {
		const commaSeperatedValue = value.split(',');
		return commaSeperatedValue[commaSeperatedValue.length - 1];
	}

	canComparePackages() {
		const packageComparisonCount = getComparisonCount(this.state.value);
		return packageComparisonCount > 1 && packageComparisonCount <= 3;
	}

	renderSuggestionItem = (item, isHighlighted) => (
		<div
			className={cx('autocomplete-input__suggestion', {
				'autocomplete-input__suggestion--highlight': isHighlighted
			})}
		>
			<div className="autocomplete-input__suggestion-detail">
				<div dangerouslySetInnerHTML={{ __html: item.highlight }} />

				<div className="autocomplete-input__suggestion-description">{item.package.description}</div>
			</div>

			<div className="autocomplete-input__compare">
				{this.canComparePackages() && (
					<button
						className="autocomplete-input__compare-btn"
						onClick={event => {
							event.preventDefault();
							event.stopPropagation();
							this.comparePackages(item);
						}}
					>
						compare
					</button>
				)}
			</div>
		</div>
	);

	handleSubmit = (e, e2, value) => {
		const { onSearchSubmit } = this.props;

		if (e) {
			e.preventDefault();
		}

		onSearchSubmit(value || this.state.value);
	};

	comparePackages = item => {
		const { value, suggestions } = this.state;

		if (value === item.package.name) return;

		if (isComparingPackages(value)) {
			const commaSeperatedValue = value.split(',');
			const lastSearchedValue = commaSeperatedValue[commaSeperatedValue.length - 1];
			if (lastSearchedValue === '') {
				this.setState({ value: value.concat(item.package.name) });
			} else {
				commaSeperatedValue.pop();
				this.setState({ value: commaSeperatedValue.join(',').concat(`,${item.package.name}`) });
			}
		}
	};

	handleInputChange = ({ target }) => {
		const { value } = target;
		this.setState({ value });
		const trimmedValue = value.trim();
		const { name } = parsePackageString(trimmedValue);

		if (trimmedValue.length > 1) {
			if (isComparingPackages(name)) {
				this.getSuggestions(name);
			} else {
				this.getSuggestions(name);
			}
		}
	};

	handleMenuVisibilityChange = isOpen => {
		this.setState({ isMenuVisible: isOpen });
	};

	render() {
		const { className, containerClass, autoFocus } = this.props;
		const { suggestions, value, isMenuVisible } = this.state;
		const { name, version } = parsePackageString(value);
		let parsedPackageString = [];
		if (isComparingPackages(value)) {
			parsedPackageString = parseComparedPackageString(value);
    }

		const baseFontSize = typeof window !== 'undefined' && window.innerWidth < 640 ? 22 : 35;
		const maxFullSizeChars = typeof window !== 'undefined' && window.innerWidth < 640 ? 15 : 20;
		const searchFontSize = value.length < maxFullSizeChars ? null : `${baseFontSize - (value.length - maxFullSizeChars) * 0.8}px`;

		return (
			<form className={cx(containerClass, 'autocomplete-input__form')} onSubmit={this.handleSubmit}>
				<div
					className={cx('autocomplete-input__container', className, {
						'autocomplete-input__container--menu-visible': isMenuVisible && !!suggestions.length
					})}
				>
					<AutoComplete
						getItemValue={item => item.package.name}
						inputProps={{
							placeholder: 'find package',
							className: 'autocomplete-input',
							autoCorrect: 'off',
							autoFocus: autoFocus,
							autoCapitalize: 'off',
							spellCheck: false,
							style: { fontSize: searchFontSize }
						}}
						onMenuVisibilityChange={this.handleMenuVisibilityChange}
						onChange={this.handleInputChange}
						ref={s => (this.searchInput = s)}
						value={value}
						items={suggestions}
						onSelect={(value, item, e) => {
							this.setState({ value, suggestions: [item] });
							this.handleSubmit(null, null, value);
						}}
						renderMenu={(items, value, inbuiltStyles) => {
							return <div style={{ minWidth: inbuiltStyles.minWidth }} className="autocomplete-input__suggestions-menu" children={items} />;
						}}
						wrapperStyle={{
							display: 'inline-block',
							width: '100%',
							position: 'relative'
						}}
						renderItem={this.renderSuggestionItem}
					/>
					<div style={{ fontSize: searchFontSize }} className="autocomplete-input__dummy-input">
						{parsedPackageString.length > 0 &&
							parsedPackageString.map((parsedPackage, index) => {
								return (
									<div key={index}>
										<span className="dummy-input__package-name">{parsedPackage.name}</span>
										<span className="dummy-input__at-separator">{parsedPackage.hasAt}</span>
										<span className="dummy-input__package-version">{parsedPackage.version}</span>
									</div>
								);
							})}
						{!parsedPackageString.length && (
							<>
								<span className="dummy-input__package-name">{name}</span>
								{version !== null && <span className="dummy-input__at-separator">@</span>}
								<span className="dummy-input__package-version">{version}</span>
							</>
						)}
					</div>
				</div>
				<div className="autocomplete-input__search-icon" onClick={this.handleSubmit}>
					<svg width="90" height="90" viewBox="0 0 90 90" xmlns="http://www.w3.org/2000/svg">
						<path d="M89.32 86.5L64.25 61.4C77.2 47 76.75 24.72 62.87 10.87 55.93 3.92 46.7.1 36.87.1s-19.06 3.82-26 10.77C3.92 17.8.1 27.05.1 36.87s3.82 19.06 10.77 26c6.94 6.95 16.18 10.77 26 10.77 9.15 0 17.8-3.32 24.55-9.4l25.08 25.1c.38.4.9.57 1.4.57.52 0 1.03-.2 1.42-.56.78-.78.78-2.05 0-2.83zM36.87 69.63c-8.75 0-16.98-3.4-23.17-9.6-6.2-6.2-9.6-14.42-9.6-23.17 0-8.75 3.4-16.98 9.6-23.17 6.2-6.2 14.42-9.6 23.17-9.6 8.75 0 16.98 3.4 23.18 9.6 12.77 12.75 12.77 33.55 0 46.33-6.2 6.2-14.43 9.6-23.18 9.6z" />
					</svg>
				</div>
			</form>
		);
	}
}
