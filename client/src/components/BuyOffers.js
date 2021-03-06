import React, { Component } from "react";
import Web3 from 'web3'
import IPFSInboxContract from "./../IPFSInbox.json";
import truffleContract from "truffle-contract";
import ipfs from './../ipfs';
import { Container, Row, Col } from 'reactstrap';
import OfferCard from './OfferCard';
import {
    Nav,
    Navbar,
    NavbarBrand,
    NavItem,
    NavLink,
    } from 'reactstrap';

import { Form, FormGroup, Input, CustomInput } from 'reactstrap';

import { Alert } from 'reactstrap';
import styles from './navbarStyle';

class BuyOffers extends Component {

    state = {
        web3: null,
        account: '',
        contract: null,
        filterIllness: false,
        filterTreatment: false,
        filterAllergy: false,
        filterLastAppointment: false,
        claimFiles: [],
        offerFiles: [],
        filteredOffers: [],
        offersChain: [],
        printOffers: false,
        filterOffers: false,
        custodianAccount: '0xcdd1c0407f7d4c6bf3dfb7cfc8e70d74b0fa99c3',
        orderSelected: '',
        showNotification: false,

    }

    selectOffer = this.selectOffer.bind(this);
    handleFilterChange = this.handleFilterChange.bind(this);
    handleOrder = this.handleOrder.bind(this);
    onDismiss = this.onDismiss.bind(this);

    componentDidMount() {
        document.title = "Medical Data Market - Comprar ofertas";
    }

    selectOffer(offer) {
        let filters = [];

        if(this.state.filterIllness) {
            filters.push('enfermedad');
        }
        if(this.state.filterTreatment) {
            filters.push('tratamiento');
        }
        if(this.state.filterAllergy) {
            filters.push('alergia');
        }
        if(this.state.filterLastAppointment) {
            filters.push('ultimacita');
        }

        let offerScheme = offer.esquema.split(',');
        let intersection = filters.filter(value => offerScheme.includes(value));

        return intersection.length > 0;
    }

    handleFilterChange(event) {
        const target = event.target;
        const value = target.type === 'checkbox' ? target.checked : target.value;
        const name = target.name;

        this.setState({ [name]: value, printOffers: false }, () => {
            
            let offers = this.state.offersChain.filter(this.selectOffer);
            this.setState({ filteredOffers: offers, printOffers: true });

        });

    }

    handleOrder(event) {
        
        let newOrder = event.target.value;
        let offers = this.isOffersFiltered() ? this.state.filteredOffers : this.state.offersChain;

        let offersOrdered;

        if(newOrder === 'precioAsc') {
            offersOrdered = offers.sort(this.compareValues('precio'));
        } else if(newOrder === 'precioDesc') {
            offersOrdered = offers.sort(this.compareValues('precio', 'desc'));
        } else if(newOrder === 'numRegAsc') {
            offersOrdered = offers.sort(this.compareValues('numReg'));
        } else {
            offersOrdered = offers.sort(this.compareValues('numReg', 'desc'));
        }

        if(this.isOffersFiltered()) {
            this.setState({ filteredOffers: offersOrdered, orderSelected: newOrder });
        } else {
            this.setState({ offersChain: offersOrdered, orderSelected: newOrder });
        }
    }

    compareValues(key, order = 'asc') {
        return function(a, b) {
            if(!a.hasOwnProperty(key) || !b.hasOwnProperty(key)) {
                return 0;
            }

            const varA = a[key];
            const varB = b[key];

            let comparison = varA > varB ? 1 : -1;

            return (
                (order === 'desc') ? (comparison * -1) : comparison
            );            
        };
    }

    componentWillMount = async () => {
        this.loadBlockchainData();
    }
    
    async loadBlockchainData() {
        const web3 = new Web3(Web3.givenProvider || "http://localhost:3000");
        const accounts = await web3.eth.getAccounts();

        const Contract = truffleContract(IPFSInboxContract);
        Contract.setProvider(web3.currentProvider);
        const instance = await Contract.deployed();

        this.setState({ web3, account: accounts[0], contract: instance }, () => { this.loadOffers(); });
    }

    loadOffers = async () => {
        let contract = this.state.contract;
        let web3 = this.state.web3;
        this.setState({ printOffers: false });
        let offers = JSON.parse(localStorage.getItem('offers'));
        if(offers === null) {
            offers = [];
            this.setState({ offersChain: [], printOffers: true });
        }

        let customersOffers = JSON.parse(localStorage.getItem('customersOffers'));
        let offersGotByCustomer = [];

        if(customersOffers !== null && this.state.account in customersOffers) {
            offersGotByCustomer = customersOffers[this.state.account];
            offers = offers.filter(offer => offersGotByCustomer.indexOf(offer.id) === -1);
        }

        let offersChain = [];

        for(var i = 0; i < offers.length; i++) {
            let offerId = offers[i].id - 1;
            
            contract.getOfferById(offerId, { from: this.state.account })
                .then(claimFileHash => {
                    
                    ipfs.get(claimFileHash, function(err, files) {
                        if(err == null) {
                            files.forEach((file) => {
                                let claimFile = JSON.parse(file.content);
                                web3.eth.personal.ecRecover(claimFile.offerFileIPFS, claimFile.signature)
                                    .then(addressWhoSigned => {
                                        
                                        if(addressWhoSigned === this.state.custodianAccount) {
                                            ipfs.get(claimFile.offerFileIPFS, function(err, files) {
                                                if(err == null) {
                                                    files.forEach((file) => {
                                                        let offerFile = JSON.parse(file.content);
                                                        offersChain.push(offerFile);
                    
                                                        if(offersChain.length === offers.length) {
                                                            this.setState({ offersChain, printOffers: true });
                                                        }
                                                    })
                                                } else {
                                                    console.log(err)
                                                }//segundo if err
                                            }.bind(this)) 
                                        }
                                    });                                                    
                            });
                        } else {
                            console.log(err)
                        }//primer if err
                    }.bind(this));

                });
        }
    }

    async buyOffer(id) {
        
        let offer = this.state.offersChain.filter(offer => offer.id === id)[0];
        let contract = this.state.contract;

        let offers = JSON.parse(localStorage.getItem('offers'));

        let userWei = await this.state.web3.eth.getBalance(this.state.account);
        let userEther = await this.state.web3.utils.fromWei(userWei, 'ether')
        
        if(userEther < offer.precio) {
            alert("No puedes comprar la oferta, necesitas más Ether")
        } else {

            let weiToPass = offer.precio * 1000000000000000000;
            let usersToReceiveEth = offers.filter(offer => offer.id === id)[0].accounts;

            contract.send(this.state.account, usersToReceiveEth, { from: this.state.account, value: weiToPass })
                .then(() => {
                    let offersWithoutBoughtOne = this.state.offersChain.filter(offer => offer.id !== id);
                    this.setState({ offersChain: offersWithoutBoughtOne, showNotification: true });

                });

            let customersOffers = JSON.parse(localStorage.getItem('customersOffers'));
            if(customersOffers == null) {
                customersOffers = {}
            }

            if(customersOffers[this.state.account] == null) {
                customersOffers[this.state.account] = [id];
            } else {
                customersOffers[this.state.account].push(id);
            }

            localStorage.setItem('customersOffers', JSON.stringify(customersOffers));

            this.updateUsersProfit(usersToReceiveEth, offer.precio/usersToReceiveEth.length);
        }
    }

    updateUsersProfit(usersToUpdateProfit, howMuch) {
        let usersProfit = JSON.parse(localStorage.getItem("usersProfit"));
        if(usersProfit == null) {
            usersProfit = {}
        }

        for(var i = 0; i < usersToUpdateProfit.length; i++) {
            let user = usersToUpdateProfit[i];

            if(user in usersProfit) {
                let newProfit = usersProfit[user] + howMuch;
                usersProfit[user] = newProfit;
            } else {
                usersProfit[user] = howMuch;
            }
        }

        localStorage.setItem("usersProfit", JSON.stringify(usersProfit));
    }

    isOffersFiltered() {
        return this.state.filterIllness || this.state.filterTreatment || this.state.filterAllergy || this.state.filterLastAppointment;
    }

    onDismiss() {
        this.setState({ showNotification: false });
    }

    hasOffers() {
        return this.state.offersChain.length !== 0;
    }

    render() {
        let offers = [];
        let existOffers = this.hasOffers();

        if(this.state.printOffers) {
            offers = this.isOffersFiltered() ? this.state.filteredOffers : this.state.offersChain;
        }        

        let offerCards = offers.map(offer => {
            return (
              <Col key={offer.id} sm="4">
                <OfferCard key={offer.id} buyOffer={this.buyOffer.bind(this)} offer={offer} />
              </Col>
            )
        })

        let profits = JSON.parse(localStorage.getItem("usersProfit"));
        let userProfit = 0;
        if(profits !== null && this.state.account in profits) {
            userProfit = profits[this.state.account];
        }

        return (
            <div>
                <Navbar style={styles.navBarStyle} color="dark" light expand="md">
                    <NavbarBrand style={styles.navBarBrandStyle} href="/ownerData">Medical Data Market</NavbarBrand>
                    <Nav className="ml-auto" navbar>
                        <NavItem>
                            <NavLink disabled style={styles.navBarProfitStyle}><i>Tu beneficio: {userProfit} ETH</i></NavLink>
                        </NavItem>
                        <NavItem>
                            <NavLink style={styles.navBarTextStyle} href="/ownerData">Mis datos</NavLink>
                        </NavItem>
                        <NavItem>
                            <NavLink disabled style={styles.navBarSelectedTextStyle} href="/buyOffers">Comprar Ofertas</NavLink>
                        </NavItem>
                        <NavItem>
                            <NavLink style={styles.navBarTextStyle} href="/purchasedOffers">Ver ofertas compradas</NavLink>
                        </NavItem>
                    </Nav>
                </Navbar>

                <center>
                    <h1>Ofertas</h1>

                    <h3>Puedes filtrar las ofertas según el esquema deseado:</h3>

                    <Form style={{ width: "700px" }} id="filter-form" className="scep-form">
                        <Row form>
                            <Col md={3}>
                                <FormGroup>
                                    <CustomInput type="checkbox" id="filterIllness" name="filterIllness" label="Enfermedad" checked={this.state.filterIllness || false} onChange={this.handleFilterChange} />
                                </FormGroup>
                            </Col>
                            <Col md={3}>
                                <FormGroup>
                                    <CustomInput type="checkbox" id="filterTreatment" name="filterTreatment" label="Tratamiento" checked={this.state.filterTreatment || false} onChange={this.handleFilterChange} />
                                </FormGroup>
                            </Col>
                            <Col md={3}>
                                <FormGroup>
                                    <CustomInput type="checkbox" id="filterAllergy" name="filterAllergy" label="Alergia" checked={this.state.filterAllergy || false} onChange={this.handleFilterChange} />
                                </FormGroup>
                            </Col>
                            <Col md={3}>
                                <FormGroup>
                                    <CustomInput type="checkbox" id="filterLastAppointment" name="filterLastAppointment" label="Última cita" checked={this.state.filterLastAppointment || false} onChange={this.handleFilterChange} />
                                </FormGroup>
                            </Col>
                        </Row>
                    </Form>

                    <Input type="select" value={this.state.orderSelected || ''} onChange={this.handleOrder} style={{ width: "500px" }}>
                        <option value='' disabled>Ordenar ofertas...</option>
                        <option key="pAsc" value="precioAsc">Por precio (de menor a mayor)</option>
                        <option key="pDesc" value="precioDesc">Por precio (de mayor a menor)</option>                                                                
                        <option key="nrAsc" value="numRegAsc">Por número de registros (de menor a mayor)</option>
                        <option key="nrDesc" value="numRegDesc">Por número de registros (de mayor a menor)</option>
                    </Input>

                    <br />

                    <Alert style={{ width: "700px" }} color="info" isOpen={this.state.showNotification} toggle={this.onDismiss}>
                        Oferta comprada con éxito. Puedes ver tus ofertas compradas <a href="/purchasedOffers">aquí</a>.
                    </Alert>

                    { this.state.printOffers ? 
                        <React.Fragment>
                            { existOffers ?
                                <React.Fragment>
                                    <Container fluid>
                                        <Row>
                                            {offerCards}
                                        </Row>
                                    </Container>
                                </React.Fragment>
                                :
                                <React.Fragment>
                                    <Alert style={{ width: "700px" }} color="warning" isOpen={true}>
                                        No hay ofertas disponibles.
                                    </Alert>
                                </React.Fragment>
                            }                            
                        </React.Fragment>
                        :
                        <React.Fragment>
                            <p><i>Cargando ofertas...</i></p>
                        </React.Fragment>
                    }
                    
                    
                </center>
            </div>

        );
    }
}

export default BuyOffers;