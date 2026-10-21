// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";

import {PythAccumulatorAdapter} from "../src/adapters/PythAccumulatorAdapter.sol";
import {PythFixtures} from "./fixtures/PythFixtures.sol";

/// @dev Every test runs against real Hermes updates, so a pass means the adapter
/// accepts exactly what Pyth publishes, not a mock of it.
contract PythAccumulatorAdapterTest is Test {
    bytes32 constant FEED_ID = 0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43;
    uint16 constant PYTHNET_CHAIN = 26;
    bytes32 constant PYTHNET_EMITTER =
        0x507974686e6574507974686e6574507974686e6574507974686e657450797468;

    // Prices carried by the fixtures (expo -8, so already USD 1e8).
    uint64 constant SEP23_PRICE = 8_612_041_730_662; // $86,120.42
    uint64 constant SEP24_PRICE = 8_450_584_233_677; // $84,505.84
    uint64 constant AUG28_PRICE = 7_741_454_987_211; // $77,414.55

    PythAccumulatorAdapter adapter;

    function _set1() internal pure returns (address[] memory g) {
        g = new address[](5);
        g[0] = 0x41534bB176E461A3fb30479400f210549eCCE638;
        g[1] = 0x6502987B62F21Cab7eb5cCd8f0173084b60d5B41;
        g[2] = 0x44A3e8F6a382412CF6BB90A3F8106e68977476C9;
        g[3] = 0x13Edc776d3063549fdB0702Af182Edc905A539d4;
        g[4] = 0x3af088854bB768065f4929e5BbdfA4Cbb04C9aF9;
    }

    function _set0() internal pure returns (address[] memory g) {
        g = new address[](5);
        g[0] = 0x41534bB176E461A3fb30479400f210549eCCE638;
        g[1] = 0x6502987B62F21Cab7eb5cCd8f0173084b60d5B41;
        g[2] = 0x44A3e8F6a382412CF6BB90A3F8106e68977476C9;
        g[3] = 0xd9D7D4529577864352c9A6539a48238fCD447052;
        g[4] = 0x1663a5A822336ece48559B1DFB1e93A017a7DAC3;
    }

    function _deploy(uint32 setIndex, address[] memory keys, uint64 maxConfBps)
        internal
        returns (PythAccumulatorAdapter)
    {
        return new PythAccumulatorAdapter(
            FEED_ID, setIndex, keys, PYTHNET_CHAIN, PYTHNET_EMITTER, 1 hours, maxConfBps, address(this)
        );
    }

    function setUp() public {
        adapter = _deploy(1, _set1(), 100);
    }

    function _data(bytes memory update) internal pure returns (bytes memory) {
        bytes[] memory updates = new bytes[](1);
        updates[0] = update;
        return abi.encode(updates);
    }

    function _flip(bytes memory b, uint256 i) internal pure returns (bytes memory c) {
        c = bytes.concat(b);
        c[i] = c[i] ^ 0x01;
    }

    // Layout of these fixtures (no trailing header, one message, 3 signatures):
    //   0 magic | 4 major | 5 minor | 6 trailing size | 7 update type
    //   8 VAA length | 10 VAA: version, set index, count, signatures from 16
    //   214 VAA body | 265 payload (root at 282) | 302 message count
    //   305 message (price at 338) | 390 proof
    uint256 constant SIGS = 16;
    uint256 constant ROOT = 282;
    uint256 constant PRICE = 338;

    // ------------------------------------------------------------- happy path

    function test_ReadsTheExpiryTick() public {
        uint64 p = adapter.getSettlementPrice(PythFixtures.SEP24_0800_TIME, _data(PythFixtures.SEP24_0800));
        assertEq(p, SEP24_PRICE);
        p = adapter.getSettlementPrice(PythFixtures.SEP23_0800_TIME, _data(PythFixtures.SEP23_0800));
        assertEq(p, SEP23_PRICE);
    }

    function test_FindsTheTickAmongSeveralUpdates() public {
        bytes[] memory updates = new bytes[](2);
        updates[0] = PythFixtures.SEP23_0800;
        updates[1] = PythFixtures.SEP24_0800;
        assertEq(
            adapter.getSettlementPrice(PythFixtures.SEP24_0800_TIME, abi.encode(updates)), SEP24_PRICE
        );
    }

    function test_EarlierGuardianSetWithItsOwnKeys() public {
        // The Aug 28 update was valid under set 0; an adapter pinned to set 0
        // verifies it, which shows the check is on keys and not on dates.
        PythAccumulatorAdapter set0 = _deploy(0, _set0(), 100);
        assertEq(
            set0.getSettlementPrice(PythFixtures.AUG28_211637_TIME, _data(PythFixtures.AUG28_211637)),
            AUG28_PRICE
        );
    }

    function test_ChargesNoFeeAndSweepsAttachedValue() public {
        assertEq(adapter.getUpdateFee(new bytes[](1)), 0);
        vm.deal(address(this), 1 ether);
        adapter.getSettlementPrice{value: 1}(PythFixtures.SEP24_0800_TIME, _data(PythFixtures.SEP24_0800));
        uint256 before = address(this).balance;
        adapter.sweep();
        assertEq(address(this).balance, before + 1);
    }

    receive() external payable {}

    // ------------------------------------------------------------- the window

    function test_Revert_WhenTickIsBeforeExpiry() public {
        vm.expectRevert(PythAccumulatorAdapter.PriceNotInWindow.selector);
        adapter.getSettlementPrice(PythFixtures.SEP24_0800_TIME + 1, _data(PythFixtures.SEP24_0800));
    }

    function test_Revert_WhenTickIsNotTheFirstAfterExpiry() public {
        // Inside the window but its previous tick also is: a settler must not
        // be able to pick any tick they like out of the hour.
        vm.expectRevert(PythAccumulatorAdapter.PriceNotInWindow.selector);
        adapter.getSettlementPrice(PythFixtures.SEP24_0800_TIME - 30, _data(PythFixtures.SEP24_0800));
    }

    function test_Revert_WhenTickIsAfterTheWindow() public {
        vm.expectRevert(PythAccumulatorAdapter.PriceNotInWindow.selector);
        adapter.getSettlementPrice(PythFixtures.SEP24_0800_TIME - 2 hours, _data(PythFixtures.SEP24_0800));
    }

    function test_Revert_WhenNoUpdates() public {
        vm.expectRevert(PythAccumulatorAdapter.PriceNotInWindow.selector);
        adapter.getSettlementPrice(PythFixtures.SEP24_0800_TIME, abi.encode(new bytes[](0)));
    }

    // ------------------------------------------------------------- signatures

    function test_Revert_WhenSignedByAnExpiredSet() public {
        vm.expectRevert(PythAccumulatorAdapter.WrongGuardianSet.selector);
        adapter.getSettlementPrice(PythFixtures.AUG28_211637_TIME, _data(PythFixtures.AUG28_211637));
    }

    function test_Revert_WhenPriceIsAltered() public {
        bytes memory forged = _flip(PythFixtures.SEP24_0800, PRICE + 7);
        vm.expectRevert(PythAccumulatorAdapter.InvalidMerkleProof.selector);
        adapter.getSettlementPrice(PythFixtures.SEP24_0800_TIME, _data(forged));
    }

    function test_Revert_WhenMerkleRootIsAltered() public {
        // Changing the root would let a forged price prove against it, but the
        // root is inside the signed body, so the signatures stop matching.
        bytes memory forged = _flip(PythFixtures.SEP24_0800, ROOT);
        vm.expectRevert(PythAccumulatorAdapter.InvalidGuardianSignature.selector);
        adapter.getSettlementPrice(PythFixtures.SEP24_0800_TIME, _data(forged));
    }

    function test_Revert_WhenSignatureIsAltered() public {
        bytes memory forged = _flip(PythFixtures.SEP24_0800, SIGS + 5);
        vm.expectRevert(PythAccumulatorAdapter.InvalidGuardianSignature.selector);
        adapter.getSettlementPrice(PythFixtures.SEP24_0800_TIME, _data(forged));
    }

    function test_Revert_WhenBelowQuorum() public {
        // Drop the last of the three signatures and fix up both lengths.
        bytes memory u = PythFixtures.SEP24_0800;
        bytes memory head = new bytes(SIGS);
        for (uint256 i; i < SIGS; ++i) {
            head[i] = u[i];
        }
        uint256 vaaLength = (uint256(uint8(u[8])) << 8) | uint8(u[9]);
        vaaLength -= 66;
        head[8] = bytes1(uint8(vaaLength >> 8));
        head[9] = bytes1(uint8(vaaLength));
        head[15] = bytes1(uint8(2));
        bytes memory twoSigs = new bytes(132);
        for (uint256 i; i < 132; ++i) {
            twoSigs[i] = u[SIGS + i];
        }
        bytes memory rest = new bytes(u.length - SIGS - 198);
        for (uint256 i; i < rest.length; ++i) {
            rest[i] = u[SIGS + 198 + i];
        }
        vm.expectRevert(PythAccumulatorAdapter.NoQuorum.selector);
        adapter.getSettlementPrice(
            PythFixtures.SEP24_0800_TIME, _data(bytes.concat(head, twoSigs, rest))
        );
    }

    function test_Revert_WhenSignaturesRepeatOrReorder() public {
        // Swap the first two signatures: indexes must strictly ascend, which is
        // what stops one guardian's signature from being counted twice.
        bytes memory u = bytes.concat(PythFixtures.SEP24_0800);
        for (uint256 i; i < 66; ++i) {
            (u[SIGS + i], u[SIGS + 66 + i]) = (u[SIGS + 66 + i], u[SIGS + i]);
        }
        vm.expectRevert(PythAccumulatorAdapter.GuardianIndexesNotAscending.selector);
        adapter.getSettlementPrice(PythFixtures.SEP24_0800_TIME, _data(u));
    }

    function test_Revert_WhenKeysDoNotMatch() public {
        address[] memory keys = _set1();
        keys[4] = makeAddr("not-a-guardian");
        PythAccumulatorAdapter other = _deploy(1, keys, 100);
        vm.expectRevert(PythAccumulatorAdapter.InvalidGuardianSignature.selector);
        other.getSettlementPrice(PythFixtures.SEP24_0800_TIME, _data(PythFixtures.SEP24_0800));
    }

    function test_Revert_WhenFromAnotherDataSource() public {
        PythAccumulatorAdapter other = new PythAccumulatorAdapter(
            FEED_ID, 1, _set1(), PYTHNET_CHAIN, bytes32(uint256(1)), 1 hours, 100, address(this)
        );
        vm.expectRevert(PythAccumulatorAdapter.WrongDataSource.selector);
        other.getSettlementPrice(PythFixtures.SEP24_0800_TIME, _data(PythFixtures.SEP24_0800));
    }

    // ------------------------------------------------------------- malformed

    function test_Revert_WhenTruncated() public {
        bytes memory u = PythFixtures.SEP24_0800;
        for (uint256 cut = 1; cut < u.length; cut += 97) {
            bytes memory t = new bytes(cut);
            for (uint256 i; i < cut; ++i) {
                t[i] = u[i];
            }
            vm.expectRevert();
            adapter.getSettlementPrice(PythFixtures.SEP24_0800_TIME, _data(t));
        }
    }

    function test_Revert_WhenMagicIsWrong() public {
        vm.expectRevert(PythAccumulatorAdapter.InvalidUpdateData.selector);
        adapter.getSettlementPrice(
            PythFixtures.SEP24_0800_TIME, _data(_flip(PythFixtures.SEP24_0800, 0))
        );
    }

    function test_Revert_WhenConfidenceTooWide() public {
        // The fixture's confidence is about 1.7 bp of price.
        PythAccumulatorAdapter strict = _deploy(1, _set1(), 1);
        vm.expectRevert(PythAccumulatorAdapter.ConfidenceTooWide.selector);
        strict.getSettlementPrice(PythFixtures.SEP24_0800_TIME, _data(PythFixtures.SEP24_0800));
    }

    function test_OtherFeedsAreIgnored() public {
        PythAccumulatorAdapter eth = new PythAccumulatorAdapter(
            bytes32(uint256(0xe7)), 1, _set1(), PYTHNET_CHAIN, PYTHNET_EMITTER, 1 hours, 100, address(this)
        );
        vm.expectRevert(PythAccumulatorAdapter.PriceNotInWindow.selector);
        eth.getSettlementPrice(PythFixtures.SEP24_0800_TIME, _data(PythFixtures.SEP24_0800));
    }

    // ------------------------------------------------------------- setup

    function test_Constructor_QuorumIsHalfPlusOne() public view {
        assertEq(adapter.quorum(), 3);
        assertEq(adapter.guardians().length, 5);
    }

    function test_Constructor_RejectsDuplicateKeys() public {
        address[] memory keys = _set1();
        keys[3] = keys[0];
        vm.expectRevert(PythAccumulatorAdapter.InvalidParams.selector);
        _deploy(1, keys, 100);
    }

    function test_Constructor_RejectsBadParams() public {
        vm.expectRevert(PythAccumulatorAdapter.InvalidParams.selector);
        _deploy(1, new address[](0), 100);
        vm.expectRevert(PythAccumulatorAdapter.InvalidParams.selector);
        _deploy(1, _set1(), 0);
        vm.expectRevert(PythAccumulatorAdapter.InvalidParams.selector);
        new PythAccumulatorAdapter(
            FEED_ID, 1, _set1(), PYTHNET_CHAIN, PYTHNET_EMITTER, 0, 100, address(this)
        );
    }
}
